const raycast = require("@raycast/eslint-config");

module.exports = [{ ignores: ["node_modules/**", "raycast-env.d.ts", "eslint.config.js"] }, ...raycast.flat()];
