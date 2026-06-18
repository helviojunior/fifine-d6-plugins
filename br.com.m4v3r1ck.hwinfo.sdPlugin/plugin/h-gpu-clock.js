/** History tile: GPU Core Clock MHz (ioreg). */
const { read } = require("./gpustats"); const { createHistoryItem } = require("./history");
async function collect(){ const s = await read(); return { value: s.clockMHz, display: s.clockMHz+" MHz" }; }
module.exports = createHistoryItem({ intervalMs:2000, title:"GPU Clock", color:"#E5533D", collect });
