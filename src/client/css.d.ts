/**
 * CSS Modules as the client build consumes them: the tsdown CSS plugin turns
 * every `.module.css` import into a class-name map (and inlines the stylesheet),
 * so the type-level shape is a plain lookup table.
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
