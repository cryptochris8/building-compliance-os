const fs = require("fs");
const path = require("path");
const BASE = "C:/Users/chris/New-apps/building-compliance-os";
function w(rel, content) {
  const fp = path.join(BASE, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, Buffer.from(content, "base64").toString("utf8"));
  console.log("Wrote: " + rel);
}

// Read file list from args
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const filePath = args[i];
  const b64File = args[i + 1];
  const content = fs.readFileSync(b64File, "utf8").trim();
  w(filePath, content);
}