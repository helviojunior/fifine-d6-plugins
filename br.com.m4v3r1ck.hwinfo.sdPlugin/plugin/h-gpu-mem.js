/** History tile: GPU VRAM in use MB (ioreg). */
const { read } = require("./gpustats"); const { createHistoryItem } = require("./history");
async function collect(){ const s = await read(); return { value: s.vramMB, display: s.vramMB+" MB" }; }
module.exports = createHistoryItem({ intervalMs:2000, title:"GPU Mem", color:"#E5533D", collect });
