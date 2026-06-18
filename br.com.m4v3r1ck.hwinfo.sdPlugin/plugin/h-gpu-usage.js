/** History tile: GPU Usage % (ioreg). */
const { read } = require("./gpustats"); const { createHistoryItem } = require("./history");
async function collect(){ const s = await read(); return { value: s.util, display: s.util+"%" }; }
module.exports = createHistoryItem({ intervalMs:2000, title:"GPU Usage", color:"#E5533D", collect });
