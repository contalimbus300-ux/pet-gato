const pet = document.getElementById("pet");
let dragging = false;
let offset = { x: 0, y: 0 };

window.addEventListener("mousedown", (e) => {
  dragging = true;
  offset.x = e.clientX;
  offset.y = e.clientY;
  pet.style.cursor = "grabbing";
});

window.addEventListener("mouseup", () => {
  dragging = false;
  pet.style.cursor = "grab";
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;

  const win = require("electron").remote.getCurrentWindow();
  const [winX, winY] = win.getPosition();

  win.setPosition(
    winX + (e.clientX - offset.x),
    winY + (e.clientY - offset.y)
  );
  const { ipcRenderer } = require('electron')

const { ipcRenderer } = require("electron")
const pet = document.getElementById("pet")

pet.addEventListener("mouseenter", () => {
  ipcRenderer.send("set-mouse-passthrough", false)
})

pet.addEventListener("mouseleave", () => {
  ipcRenderer.send("set-mouse-passthrough", true)
})

});