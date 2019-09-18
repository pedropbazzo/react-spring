import { is } from 'shared'
import { Animated, Payload } from './Animated'

/** An animated number or a native attribute value */
export class AnimatedValue<T = any> extends Animated {
  done = true
  elapsedTime!: number
  lastPosition!: number
  lastVelocity?: number | null
  v0?: number | null

  constructor(protected _value: T) {
    super()
    if (is.num(this._value)) {
      this.lastPosition = this._value
    }
  }

  static create<T>(from: T, _to?: T | null) {
    return new AnimatedValue(from)
  }

  getPayload(): Payload {
    return [this]
  }

  getValue() {
    return this._value
  }

  setValue(value: T) {
    this._value = value
  }

  reset(isActive?: boolean, _goal?: T) {
    this.done = false
    if (is.num(this._value)) {
      this.elapsedTime = 0
      this.lastPosition = this._value
      if (!isActive) this.lastVelocity = null
      this.v0 = null
    }
  }
}
