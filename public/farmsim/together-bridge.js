/* Together Farm — patches FarmGame after load (harvest notify parent). */
(function () {
  var orig = FarmGame.prototype.harvest;
  FarmGame.prototype.harvest = function (cell) {
    var ct = cell.crop && cell.crop.amount > 1 ? cell.crop.type : null;
    var x = cell.x;
    var y = cell.y;
    var r = orig.apply(this, arguments);
    if (r && ct && window.parent !== window) {
      window.parent.postMessage(
        {
          source: "together-farm",
          type: "harvest",
          cropType: ct,
          x: x,
          y: y,
        },
        "*",
      );
    }
    return r;
  };
})();

window.addEventListener("message", function (ev) {
  if (!ev.data || ev.data.source !== "together-farm-parent") return;
  if (ev.data.type === "requestSnapshot" && window.__togetherGame) {
    window.parent.postMessage(
      {
        source: "together-farm",
        type: "snapshot",
        payload: window.__togetherGame.serialize(),
      },
      "*",
    );
  }
});
