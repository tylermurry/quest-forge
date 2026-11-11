// Mermaid imports d3 only through the `d3` package, which declares `sideEffects: false`. The bundler then drops
// d3-transition's patch that adds `.transition()` to selections, and hovering a diagram box throws
// "tooltipElem.transition is not a function". Importing it here keeps the patch in the client bundle.
import "d3-transition";
