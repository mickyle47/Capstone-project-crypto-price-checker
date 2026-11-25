// Entry point: build the app and start listening.
import { createApp } from "./app.js";

const port = process.env.PORT || 3000;

createApp().listen(port, () => {
  console.log(`Server running on port ${port}`);
});
