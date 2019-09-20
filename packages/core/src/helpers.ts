import { is, Merge, each, AnyFn, toArray, OneOrMore } from 'shared'
import { ReservedProps, ForwardProps } from './types/common'
import { useMemoOne } from 'use-memo-one'

declare const process:
  | { env: { [key: string]: string | undefined } }
  | undefined

// @see https://github.com/alexreardon/use-memo-one/pull/10
export const useMemo: typeof useMemoOne = (create, deps) =>
  useMemoOne(create, deps || [{}])

export function callProp<T>(
  value: T,
  ...args: AnyFn extends T ? Parameters<Extract<T, AnyFn>> : unknown[]
): T extends AnyFn<any, infer U> ? U : T {
  return is.fun(value) ? value(...args) : value
}

export type MatchProp<P extends string = string> =
  | boolean
  | OneOrMore<P>
  | ((key: P) => boolean)

/** Try to coerce the given value into a boolean using the given key */
export const matchProp = <P extends string = string>(
  value: MatchProp<P> | undefined,
  key: P | undefined
) =>
  value === true ||
  !!(
    key &&
    value &&
    (is.fun(value) ? value(key) : toArray(value).includes(key))
  )

type AnyProps<T, Arg = never> = OneOrMore<T> | ((i: number, arg: Arg) => T)

export const getProps = <T, Arg = never>(
  props: AnyProps<T, Arg>,
  i: number,
  arg: Arg
) => (is.fun(props) ? props(i, arg) : is.arr(props) ? props[i] : { ...props })

/** These props can have default values */
export const DEFAULT_PROPS = [
  'config',
  'immediate',
  'onAnimate',
  'onStart',
  'onChange',
  'onRest',
] as const

const RESERVED_PROPS: Required<ReservedProps> = {
  children: 1,
  config: 1,
  from: 1,
  to: 1,
  ref: 1,
  reset: 1,
  cancel: 1,
  reverse: 1,
  immediate: 1,
  default: 1,
  delay: 1,
  lazy: 1,
  items: 1,
  trail: 1,
  sort: 1,
  expires: 1,
  initial: 1,
  enter: 1,
  leave: 1,
  update: 1,
  onAnimate: 1,
  onStart: 1,
  onRest: 1,
  onChange: 1,
  onFrame: 1,
}

/**
 * Extract any properties whose keys are *not* reserved for customizing your
 * animations. All hooks use this function, which means `useTransition` props
 * are reserved for `useSpring` calls, etc.
 */
function getForwardProps<Props extends ReservedProps>(
  props: Props
): ForwardProps<Props> {
  const forward: any = {}
  each(props, (value, prop) => {
    if (!RESERVED_PROPS[prop as keyof ReservedProps]) {
      forward[prop] = value
    }
  })
  return forward
}

export type InterpolateTo<T extends object> = Merge<
  { to: ForwardProps<T> },
  Pick<T, keyof T & keyof ReservedProps>
>

export function interpolateTo<T extends object>(props: T): InterpolateTo<T> {
  const to = getForwardProps(props)
  const out: any = { to }
  each(props, (val, key) => key in to || (out[key] = val))
  return out
}

type ItemKey = number | string

interface Item {
  key: ItemKey
  originalKey: ItemKey
  phase: string
  item: any
  props: object
  destroyed?: boolean
}

interface DeletedItem extends Item {
  left?: ItemKey
  right?: ItemKey
}

/**
 * This tries to put deleted items back into the given `out` list in correct
 * order. Deleted items must have a `left` and `right` property with key of
 * their sibling which is used to find the correct placement.
 */
export function reconcileDeleted(
  deleted: DeletedItem[],
  current: Item[]
): any[] {
  // Copy as we will be mutating the arrays
  deleted = [...deleted]
  current = [...current]

  // Used to detect deadlock (when a pass finds 0 siblings)
  let failedTries = 0

  // Track where the current pass start/ends
  let passIndex = 0
  let nextPassIndex = deleted.length

  // Insert all deleted items into `current`
  for (let i = 0; i < deleted.length; i++) {
    if (i === nextPassIndex) {
      // Sanity test: Push to end if somehow no siblings were found
      if (passIndex + failedTries === nextPassIndex) {
        for (let j = i; j < deleted.length; j++) {
          const { left, right, ...deletedItem } = deleted[j]
          current.push(deletedItem)
        }
        break
      }
      // Update local state at the end of each pass
      passIndex = nextPassIndex
      nextPassIndex = deleted.length
      failedTries = 0
    }

    // The index of the deleted item in `current`
    let index = -1

    // Look for the left or right sibling in `current`
    const { left, right, ...deletedItem } = deleted[i]
    for (let j = current.length; --j >= 0; ) {
      const { originalKey: key } = current[j]
      if (key === right) {
        index = j
        break
      }
      if (key === left) {
        index = j + 1
        break
      }
    }

    // Items with no index are revisited in the next pass
    if (index < 0) {
      failedTries++
      deleted.push(deleted[i])
    } else {
      current.splice(index, 0, deletedItem)
    }
  }

  return current
}

export function freeze<T extends object>(obj: T): T {
  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development'
  ) {
    return Object.freeze(obj)
  }
  return obj
}
