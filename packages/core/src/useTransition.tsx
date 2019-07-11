import React, { useEffect, useRef, useImperativeHandle, ReactNode } from 'react'
import { is, toArray, useForceUpdate, useOnce } from 'shared'
import { callProp, interpolateTo } from './helpers'
import { Controller } from './Controller'
import { now } from 'shared/globals'

// TODO: convert to "const enum" once Babel supports it
type Phase = number
/** This transition is being mounted */
const MOUNT = 0
/** This transition is entering or has entered */
const ENTER = 1
/** This transition had its animations updated */
const UPDATE = 2
/** This transition will expire after animating */
const LEAVE = 3

export function useTransition<T>(
  data: T | readonly T[],
  props: any,
  deps?: any
) {
  const { key, ref, reset, sort, trail = 0, expires = Infinity } = props

  // Every item has its own transition.
  const items = toArray(data)
  const transitions: Transition[] = []

  // Explicit keys are used to associate transitions with immutable items.
  const keys = is.und(key) ? key : is.fun(key) ? items.map(key) : toArray(key)

  // The "onRest" callbacks need a ref to the latest transitions.
  const usedTransitions = useRef<Transition[] | null>(null)
  const prevTransitions = usedTransitions.current
  useEffect(() => {
    usedTransitions.current = transitions
  })

  // Destroy all transitions on dismount.
  useOnce(() => () => {
    usedTransitions.current!.forEach(t => t.spring.destroy())
  })

  // Determine which transitions can be reused.
  const prevKeys: any[] = []
  if (prevTransitions && !reset)
    prevTransitions.forEach(t => {
      if (is.und(t.expiresBy)) {
        prevKeys.push(keys ? t.key : t.item)
        transitions.push(t)
      } else {
        clearTimeout(t.expirationId)
      }
    })

  // Append new transitions for new items.
  items.forEach((item, i) => {
    const key = keys && keys[i]
    if (prevKeys.indexOf(keys ? key : item) < 0) {
      const spring = new Controller()
      transitions.push({ id: spring.id, key, item, phase: MOUNT, spring })
    }
  })

  if (is.fun(sort)) {
    transitions.sort((a, b) => sort(a.item, b.item))
  }

  // Track cumulative delay for the "trail" prop.
  let delay = -trail

  // Expired transitions use this to dismount.
  const forceUpdate = useForceUpdate()

  // Generate changes to apply in useEffect.
  const changes = new Map<Transition<T>, Change>()
  transitions.forEach((t, i) => {
    let to: any
    let from: any
    let phase: Phase
    if (t.phase == MOUNT) {
      to = props.enter
      phase = ENTER
      // The "initial" prop is only used on first render. It always overrides
      // the "from" prop when defined, and it makes "enter" instant when null.
      from = props.initial
      if (is.und(from) || (prevTransitions && !reset)) {
        from = props.from
      }
    } else {
      const isDeleted = (keys || items).indexOf(keys ? t.key : t.item) < 0
      if (t.phase < LEAVE) {
        if (isDeleted) {
          to = props.leave
          phase = LEAVE
        } else if ((to = props.update)) {
          phase = UPDATE
        } else return
      } else if (!isDeleted) {
        to = props.enter
        phase = ENTER
      } else return
    }

    const payload: any = {
      // When "to" is a function, it can return (1) an array of "useSpring" props,
      // (2) an async function, or (3) an object with any "useSpring" props.
      to: to = callProp(to, t.item, i),
      from: callProp(from, t.item, i),
      delay: delay += trail,
      config: callProp(props.config, t.item, i),
      ...(is.obj(to) && interpolateTo(to)),
    }

    const { onRest } = payload
    payload.onRest = (values: any) => {
      if (is.fun(onRest)) {
        onRest(values)
      }
      if (t.phase == LEAVE) {
        t.expiresBy = now() + expires
        if (expires <= 0) {
          forceUpdate()
        } else {
          // Postpone dismounts while other controllers are active.
          const transitions = usedTransitions.current!
          if (transitions.every(t => t.spring.idle)) {
            forceUpdate()
          } else if (expires < Infinity) {
            t.expirationId = setTimeout(forceUpdate, expires)
          }
        }
      }
    }

    const change: Change = { phase }
    changes.set(t, change)

    // To ensure all Animated nodes exist during render,
    // the payload must be applied immediately for new items.
    if (t.phase > MOUNT) {
      change.payload = payload
    } else {
      t.spring.update(payload)
    }
  })

  useImperativeHandle(
    ref,
    () => ({
      get controllers() {
        return usedTransitions.current!.map(t => t.spring)
      },
      start: () =>
        Promise.all(
          usedTransitions.current!.map(
            t => new Promise(done => t.spring.start(done))
          )
        ),
      stop: (finished?: boolean) =>
        usedTransitions.current!.forEach(t => t.spring.stop(finished)),
    }),
    []
  )

  useEffect(
    () => {
      changes.forEach(({ phase, payload }, t) => {
        t.phase = phase
        if (payload) t.spring.update(payload)
        if (!ref) t.spring.start()
      })
    },
    reset ? void 0 : deps
  )

  return (render: (props: any, item: T) => ReactNode) =>
    transitions.map(t => {
      const elem: any = render({ ...t.spring.animated }, t.item)
      return elem && elem.type ? (
        <elem.type {...elem.props} key={t.id} ref={elem.ref} />
      ) : (
        elem
      )
    })
}

interface Change {
  phase: Phase
  payload?: any
}

interface Transition<T = any> {
  id: number
  key?: keyof any
  item: T
  phase: Phase
  spring: Controller
  /** Destroy no later than this date */
  expiresBy?: number
  expirationId?: number
}
