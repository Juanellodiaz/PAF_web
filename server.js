require("dotenv").config();

const path = require("path");
const express = require("express");
const api = require("./server/app");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

app.use(api);
app.use(express.static(ROOT));

app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PAF server → http://localhost:${PORT}`);
  });
}
