// Polyfill Array.toReversed for Node 18 compatibility
if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}
