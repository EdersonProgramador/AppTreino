import("./apps/api/dist/server.js").catch((error) => {
  console.error(error);
  process.exit(1);
});
