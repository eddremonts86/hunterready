import { Children, Fragment, cloneElement, isValidElement } from 'react'
import type { CSSProperties, ReactNode, SVGProps } from 'react'

import { normalizeTakumiStyle, pointToCssPixel } from '@/lib/pdf-primitives'

type SvgChildProps = Record<string, unknown> & {
  children?: ReactNode
}

const resolveSvgChildren = (children: ReactNode): ReactNode =>
  Children.map(children, (child) => {
    if (!isValidElement<SvgChildProps>(child)) {
      return child
    }

    if (typeof child.type === 'function') {
      const resolved = (child.type as (props: SvgChildProps) => ReactNode)(
        child.props,
      )
      return resolveSvgChildren(resolved)
    }

    if ((child.type as unknown) === Fragment) {
      return resolveSvgChildren(child.props.children)
    }

    if (child.props.children === undefined) {
      return child
    }

    return cloneElement(
      child,
      undefined,
      resolveSvgChildren(child.props.children),
    )
  })

export const Svg = ({
  children,
  style,
  height,
  viewBox,
  width,
  ...rest
}: SVGProps<SVGSVGElement> & { style?: CSSProperties }) => {
  const numericHeight = typeof height === 'number' ? height : undefined
  const numericWidth = typeof width === 'number' ? width : undefined

  return (
    <svg
      style={
        style
          ? (normalizeTakumiStyle(
              style as Record<string, unknown>,
            ) as CSSProperties)
          : undefined
      }
      height={
        numericHeight === undefined ? height : pointToCssPixel(numericHeight)
      }
      viewBox={
        viewBox ??
        (numericWidth !== undefined && numericHeight !== undefined
          ? `0 0 ${numericWidth} ${numericHeight}`
          : undefined)
      }
      width={numericWidth === undefined ? width : pointToCssPixel(numericWidth)}
      {...rest}
    >
      {resolveSvgChildren(children)}
    </svg>
  )
}

export const Rect = (props: SVGProps<SVGRectElement>) => <rect {...props} />
export const Circle = (props: SVGProps<SVGCircleElement>) => (
  <circle {...props} />
)
export const G = (props: SVGProps<SVGGElement>) => <g {...props} />
export const Line = (props: SVGProps<SVGLineElement>) => <line {...props} />
export const Path = (props: SVGProps<SVGPathElement>) => <path {...props} />
export const SvgText = ({
  children,
  style,
  ...rest
}: SVGProps<SVGTextElement> & {
  children?: ReactNode
  style?: CSSProperties
}) => {
  const { fontFamily, fontSize, fontStyle, fontWeight, ...remainingStyle } =
    style ?? {}

  return (
    <text
      fontFamily={fontFamily ?? 'sans-serif'}
      fontSize={fontSize}
      fontStyle={fontStyle}
      fontWeight={fontWeight}
      style={remainingStyle}
      {...rest}
    >
      {children}
    </text>
  )
}
