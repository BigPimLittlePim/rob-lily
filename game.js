(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  let W = canvas.width;
  const H = canvas.height;
  function sizeCanvas() {
    W = window.matchMedia("(max-width: 700px)").matches ? 720 : 960;
    if (canvas.width !== W) canvas.width = W;
  }
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);
  const GROUND = 418;
  const WORLD = 4600;
  const GOAL = 4430;
  const SPEED = 268;
  const GRAVITY = 1750;
  const JUMP = -650;
  const ground = [[0, 1150], [1240, 2250], [2330, 3380], [3470, WORLD]];
  const obstacles = [
    { x: 352, w: 44, h: 42, type: "crate" },
    { x: 778, w: 66, h: 28, type: "log" },
    { x: 1000, w: 54, h: 35, type: "rock" },
    { x: 1490, w: 48, h: 48, type: "crate" },
    { x: 1935, w: 70, h: 30, type: "log" },
    { x: 2130, w: 50, h: 36, type: "rock" },
    { x: 2660, w: 44, h: 44, type: "crate" },
    { x: 3100, w: 70, h: 28, type: "log" },
    { x: 3630, w: 52, h: 37, type: "rock" },
    { x: 3940, w: 46, h: 44, type: "crate" }
  ].map(item => ({ ...item, y: GROUND - item.h }));
  const hazards = [
    { x: 586, w: 56 }, { x: 1720, w: 64 }, { x: 2860, w: 58 }, { x: 4180, w: 60 }
  ].map(item => ({ ...item, y: GROUND - 18, h: 18 }));
  const fishTemplate = [
    [245, 337], [510, 337], [900, 332], [1190, 332], [1435, 337],
    [1860, 337], [2290, 332], [2775, 337], [3420, 332], [4080, 337]
  ];
  const checkpoints = [1290, 2430, 3550];
  const trees = [175, 465, 915, 1370, 1660, 2060, 2530, 2820, 3230, 3590, 3850, 4250];
  const benches = [680, 1590, 3000, 3750];
  const keys = { left: false, right: false };
  const player = { x: 70, y: GROUND - 42, w: 34, h: 42, vx: 0, vy: 0, onGround: true, facing: 1, coyote: 0, jumpBuffer: 0, walk: 0 };
  const ui = {
    overlay: document.querySelector("#overlay"),
    icon: document.querySelector("#overlay-icon"),
    kicker: document.querySelector("#overlay-kicker"),
    title: document.querySelector("#overlay-title"),
    text: document.querySelector("#overlay-text"),
    button: document.querySelector("#overlay-button"),
    fish: document.querySelector("#fish-count"),
    hearts: document.querySelector("#hearts"),
    distance: document.querySelector("#distance"),
    toast: document.querySelector("#toast"),
    sound: document.querySelector("#sound-button")
  };

  let mode = "intro";
  let fish = fishTemplate.map(([x, y]) => ({ x, y, collected: false }));
  let collected = 0;
  let hearts = 3;
  let checkpoint = 70;
  let camera = 0;
  let time = 0;
  let toastUntil = 0;
  let soundOn = true;
  let audio;
  let lastFrame = 0;

  const rect = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const rand = n => {
    const v = Math.sin(n * 127.1 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const clearKeys = () => { keys.left = false; keys.right = false; };

  function tone(frequency, duration, type = "square", volume = 0.055) {
    if (!soundOn) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch (_) {
      // The game remains playable when audio is unavailable.
    }
  }

  function updateHud() {
    ui.fish.textContent = `${collected} / ${fish.length}`;
    ui.hearts.textContent = "♥ ".repeat(hearts) + "♡ ".repeat(3 - hearts);
    ui.distance.textContent = `${Math.min(100, Math.floor(player.x / GOAL * 100))}%`;
  }

  function showOverlay(icon, kicker, title, description, button) {
    ui.icon.textContent = icon;
    ui.kicker.textContent = kicker;
    ui.title.textContent = title;
    ui.text.textContent = description;
    ui.button.innerHTML = `${button} <span aria-hidden="true">→</span>`;
    ui.overlay.classList.remove("hidden");
  }

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("visible");
    toastUntil = time + 2.2;
  }

  function reset() {
    fish = fishTemplate.map(([x, y]) => ({ x, y, collected: false }));
    collected = 0;
    hearts = 3;
    checkpoint = 70;
    camera = 0;
    time = 0;
    toastUntil = 0;
    ui.toast.classList.remove("visible");
    Object.assign(player, { x: 70, y: GROUND - 42, vx: 0, vy: 0, onGround: true, facing: 1, coyote: 0, jumpBuffer: 0, walk: 0 });
    clearKeys();
    mode = "playing";
    ui.overlay.classList.add("hidden");
    updateHud();
  }

  function pause() {
    if (mode === "playing") {
      mode = "paused";
      clearKeys();
      showOverlay("⏸", "A LITTLE BREATHER", "Taking a break?", "The park will be here when you're ready.", "RESUME");
    } else if (mode === "paused") {
      mode = "playing";
      ui.overlay.classList.add("hidden");
    }
  }

  function jump() {
    if (mode === "playing") player.jumpBuffer = 0.13;
  }

  function damage() {
    if (mode !== "playing") return;
    hearts--;
    tone(210, 0.24, "sawtooth", 0.045);
    clearKeys();
    if (hearts <= 0) {
      mode = "lost";
      showOverlay("💔", "ONE MORE TRY?", "The park got you!", `You found ${collected} fish. Give the little cat another chance.`, "TRY AGAIN");
    } else {
      Object.assign(player, { x: checkpoint, y: GROUND - player.h, vx: 0, vy: 0, onGround: true, coyote: 0, jumpBuffer: 0 });
      camera = Math.max(0, checkpoint - 300);
      toast("OOPS! BACK TO THE LAST CHECKPOINT");
    }
    updateHud();
  }

  function win() {
    mode = "won";
    clearKeys();
    tone(523, 0.13);
    setTimeout(() => tone(659, 0.13), 120);
    setTimeout(() => tone(784, 0.32), 250);
    showOverlay("🎉", "PICNIC TIME!", "You made it!", `The little cat reached the picnic with ${collected} of ${fish.length} fish snacks.`, "PLAY AGAIN");
  }

  function update(dt) {
    if (mode !== "playing") return;
    time += dt;
    if (toastUntil && time > toastUntil) {
      ui.toast.classList.remove("visible");
      toastUntil = 0;
    }
    player.coyote = player.onGround ? 0.1 : Math.max(0, player.coyote - dt);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.vy = JUMP;
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      tone(392, 0.08);
    }
    player.vx = (Number(keys.right) - Number(keys.left)) * SPEED;
    if (player.vx) {
      player.facing = Math.sign(player.vx);
      player.walk += dt * 12;
    } else {
      player.walk = 0;
    }

    player.x = Math.max(0, Math.min(WORLD - player.w, player.x + player.vx * dt));
    for (const block of obstacles) {
      if (!intersects(player, block)) continue;
      if (player.vx > 0) player.x = block.x - player.w;
      if (player.vx < 0) player.x = block.x + block.w;
    }

    const previousBottom = player.y + player.h;
    const previousTop = player.y;
    player.vy = Math.min(950, player.vy + GRAVITY * dt);
    player.y += player.vy * dt;
    player.onGround = false;
    for (const block of obstacles) {
      if (!intersects(player, block)) continue;
      if (player.vy >= 0 && previousBottom <= block.y + 4) {
        player.y = block.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0 && previousTop >= block.y + block.h - 4) {
        player.y = block.y + block.h;
        player.vy = 0;
      }
    }
    if (player.vy >= 0 && previousBottom <= GROUND + 5 && player.y + player.h >= GROUND) {
      const middle = player.x + player.w / 2;
      if (ground.some(([start, end]) => middle >= start && middle <= end)) {
        player.y = GROUND - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }
    if (player.y > H + 40 || hazards.some(hazard => intersects(player, hazard))) {
      damage();
      return;
    }

    for (const snack of fish) {
      if (snack.collected) continue;
      if (intersects(player, { x: snack.x - 12, y: snack.y - 11, w: 25, h: 22 })) {
        snack.collected = true;
        collected++;
        tone(620, 0.09);
        setTimeout(() => tone(830, 0.12), 70);
        toast("+1 FISH SNACK!");
      }
    }
    for (const point of checkpoints) {
      if (player.x >= point && checkpoint < point) {
        checkpoint = point;
        tone(600, 0.15);
        toast("CHECKPOINT REACHED!");
      }
    }
    if (player.x >= GOAL) win();
    camera += (Math.max(0, Math.min(WORLD - W, player.x - 290)) - camera) * Math.min(1, dt * 8);
    updateHud();
  }

  function cloud(x, y, scale = 1) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    rect(12, 0, 74, 15, "#ffffff");
    rect(0, 15, 115, 22, "#ffffff");
    rect(10, 37, 95, 8, "#d7eced");
    ctx.restore();
  }

  function background() {
    rect(0, 0, W, H, "#d8f2f8");
    rect(0, 270, W, 220, "#b5dfcf");
    rect(0, 321, W, 165, "#96cdb6");
    rect(0, 372, W, 85, "#7cb799");
    rect(0, 447, W, 93, "#8ec9d4");
    const parallax = camera * 0.21;
    for (let x = -250; x < WORLD; x += 290) {
      const screen = x - parallax;
      if (screen < -210 || screen > W + 210) continue;
      rect(screen + 50, 296, 185, 75, "#a7d7c2");
      rect(screen + 82, 278, 116, 20, "#a7d7c2");
      rect(screen + 108, 259, 68, 20, "#a7d7c2");
      rect(screen + 140, 326, 160, 65, "#8fc5aa");
      rect(screen + 177, 304, 95, 25, "#8fc5aa");
    }
    for (let i = 0; i < 18; i++) {
      const x = i * 265 + 50 - camera * 0.12;
      if (x > -140 && x < W + 140) cloud(x, 65 + (i % 4) * 38, 0.75 + (i % 3) * 0.16);
    }
    rect(0, 406, W, 10, "#80b99d");
  }

  function tree(x, variant) {
    const height = variant % 2 ? 111 : 137;
    const top = GROUND - height;
    rect(x + 24, top + 45, 25, height - 45, "#7b6147");
    rect(x + 25, top + 45, 6, height - 45, "#a98152");
    rect(x + 34, top + 75, 5, 24, "#5d4e3e");
    rect(x - 14, top + 30, 99, 55, "#3e8f69");
    rect(x - 1, top + 8, 73, 79, "#4fa777");
    rect(x + 16, top, 40, 15, "#63b783");
    rect(x - 11, top + 63, 15, 17, "#357d5c");
    rect(x + 62, top + 63, 19, 17, "#357d5c");
    for (let i = 0; i < 8; i++) {
      const px = x + Math.floor(rand(x + i) * 68);
      const py = top + 23 + Math.floor(rand(i + x * 2) * 47);
      rect(px, py, 5, 5, i % 3 ? "#78c892" : "#cee39b");
    }
  }

  function bench(x) {
    rect(x, GROUND - 39, 71, 8, "#a8754b");
    rect(x + 5, GROUND - 55, 62, 13, "#c5945e");
    rect(x + 8, GROUND - 29, 55, 7, "#b17d4d");
    rect(x + 12, GROUND - 22, 6, 22, "#554d41");
    rect(x + 52, GROUND - 22, 6, 22, "#554d41");
  }

  function lamp(x) {
    rect(x + 11, GROUND - 163, 9, 163, "#50635c");
    rect(x - 2, GROUND - 170, 35, 9, "#435950");
    rect(x + 5, GROUND - 190, 21, 20, "#f8db85");
    rect(x + 9, GROUND - 187, 13, 14, "#fff3bc");
    rect(x + 2, GROUND - 194, 27, 5, "#40564d");
  }

  function pond(start, end) {
    rect(start, GROUND + 13, end - start, H - GROUND, "#80c9d1");
    rect(start, GROUND + 13, end - start, 8, "#b9e4df");
    for (let x = start + 12; x < end - 8; x += 34) {
      const wobble = Math.sin(time * 2 + x) * 2;
      rect(x, GROUND + 36 + wobble, 18, 3, "#d0ebdd");
      rect(x + 9, GROUND + 69 - wobble, 19, 3, "#a7dbdb");
    }
    rect(start - 10, GROUND - 12, 5, 21, "#4c986c");
    rect(end + 6, GROUND - 15, 5, 25, "#4c986c");
  }

  function groundTiles() {
    for (let i = 0; i < ground.length - 1; i++) pond(ground[i][1], ground[i + 1][0]);
    for (const [start, end] of ground) {
      if (end < camera - 50 || start > camera + W + 50) continue;
      rect(start, GROUND + 8, end - start, H - GROUND, "#a77e55");
      rect(start, GROUND + 29, end - start, H - GROUND, "#98704e");
      rect(start, GROUND, end - start, 13, "#5cae71");
      rect(start, GROUND + 10, end - start, 7, "#43885c");
      for (let x = Math.floor(start / 26) * 26; x < end; x += 26) {
        if (x < start || x > end - 8) continue;
        rect(x + 5, GROUND + 24 + Math.floor(rand(x) * 60), 10, 5, rand(x * 3) > .5 ? "#b88b5d" : "#7d654c");
        rect(x + 15, GROUND + 6, 6, 4, "#76c583");
      }
    }
  }

  function flower(x, color) {
    rect(x + 4, GROUND - 16, 3, 16, "#408f61");
    rect(x, GROUND - 20, 5, 5, color);
    rect(x + 7, GROUND - 20, 5, 5, color);
    rect(x + 4, GROUND - 24, 5, 5, color);
    rect(x + 4, GROUND - 17, 5, 5, "#f6d968");
    rect(x - 2, GROUND - 7, 6, 4, "#58a669");
  }

  function obstacle(block) {
    const { x, y, w, h, type } = block;
    if (type === "crate") {
      rect(x - 2, y - 2, w + 4, h + 4, "#6e5540");
      rect(x + 3, y + 3, w - 6, h - 6, "#c28d56");
      rect(x + 5, y + 5, w - 10, 7, "#d9a76b");
      rect(x + 5, y + h - 12, w - 10, 7, "#a97349");
      rect(x + 8, y + 12, 6, h - 24, "#9f7049");
      rect(x + w - 14, y + 12, 6, h - 24, "#9f7049");
      rect(x + 17, y + 17, w - 34, h - 34, "#dfb578");
    } else if (type === "log") {
      rect(x + 2, y + 8, w - 4, h - 8, "#815b3f");
      rect(x + 6, y + 4, w - 16, h - 7, "#a47548");
      rect(x + 9, y + 7, w - 22, 5, "#bd9156");
      rect(x + w - 15, y + 9, 12, h - 11, "#d5ae74");
      rect(x + w - 11, y + 14, 5, h - 19, "#a47a52");
    } else {
      rect(x + 5, y + 8, w - 8, h - 8, "#737f7b");
      rect(x + 12, y + 2, w - 22, h - 4, "#9faeaa");
      rect(x + 18, y + 5, w - 31, 8, "#c3cec1");
      rect(x + 8, y + h - 8, w - 13, 6, "#617572");
    }
  }

  function bramble(hazard) {
    const { x, y, w } = hazard;
    rect(x, y + 11, w, 7, "#376c53");
    for (let i = 0; i < w; i += 12) {
      rect(x + i + 4, y + 2, 5, 14, "#43875b");
      rect(x + i + 2, y + 7, 11, 6, "#5ba269");
      rect(x + i + 6, y - 1, 3, 5, "#e28975");
    }
  }

  function snack(item) {
    if (item.collected) return;
    const x = item.x;
    const y = item.y + Math.sin(time * 4 + x) * 3;
    rect(x - 12, y - 2, 6, 6, "#db854e");
    rect(x - 16, y - 6, 5, 4, "#e5a263");
    rect(x - 16, y + 4, 5, 4, "#e5a263");
    rect(x - 6, y - 7, 17, 16, "#f4b85e");
    rect(x - 3, y - 9, 12, 4, "#ffdc82");
    rect(x + 10, y - 4, 6, 10, "#e19a4d");
    rect(x + 7, y - 3, 3, 3, "#4b5a4d");
    rect(x - 1, y - 4, 4, 4, "#fff0b5");
  }

  function flag(x, active) {
    rect(x + 8, GROUND - 76, 5, 76, "#555e50");
    rect(x + 13, GROUND - 72, 34, 23, active ? "#f4cc6c" : "#e5f1dd");
    rect(x + 13, GROUND - 72, 5, 23, active ? "#d69a55" : "#aac3a8");
    rect(x + 23, GROUND - 66, 13, 9, active ? "#fff1be" : "#c1d6bd");
  }

  function picnic() {
    const x = GOAL + 30;
    rect(x - 50, GROUND - 5, 155, 6, "#e8cf91");
    for (let i = 0; i < 6; i++) {
      rect(x - 40 + i * 22, GROUND - 11, 22, 7, i % 2 ? "#fff3d4" : "#e8897d");
    }
    rect(x + 18, GROUND - 36, 50, 27, "#c68956");
    rect(x + 25, GROUND - 44, 36, 9, "#a66b48");
    rect(x + 32, GROUND - 32, 20, 9, "#ebc282");
    rect(x + 1, GROUND - 26, 15, 17, "#f7d98e");
    rect(x + 5, GROUND - 30, 7, 5, "#f4af73");
    for (let i = 0; i < 5; i++) rect(x + 80 + i * 8, GROUND - 18 - i % 2 * 5, 4, 14, "#68a879");
  }

  function cat() {
    const x = Math.round(player.x);
    const y = Math.round(player.y);
    const moving = player.vx !== 0 && player.onGround;
    const leg = moving ? Math.round(Math.sin(player.walk) * 3) : 0;
    ctx.save();
    ctx.translate(x + player.w / 2, y);
    ctx.scale(player.facing, 1);
    ctx.translate(-player.w / 2, 0);
    const r = (a, b, c, d, color) => rect(a, b, c, d, color);
    r(-11, 21, 10, 5, "#9f6942");
    r(-15, 14, 5, 12, "#bd8550");
    r(-13, 10, 5, 7, "#df9a58");
    r(4, 18, 28, 18, "#bd7e46");
    r(7, 15, 21, 20, "#e9a55e");
    r(11, 19, 4, 12, "#c18149");
    r(22, 19, 4, 12, "#c18149");
    r(7, 32, 7, 10 + leg, "#a96b40");
    r(24, 32, 7, 10 - leg, "#a96b40");
    r(7, 38 + leg, 9, 4, "#f9ddba");
    r(24, 38 - leg, 9, 4, "#f9ddba");
    r(7, 5, 28, 21, "#cf8c4e");
    r(10, 0, 7, 11, "#bd7d48");
    r(27, 0, 7, 11, "#bd7d48");
    r(12, 3, 3, 5, "#efb3a0");
    r(29, 3, 3, 5, "#efb3a0");
    r(10, 9, 25, 14, "#f0b674");
    r(12, 14, 4, 5, "#344641");
    r(28, 14, 4, 5, "#344641");
    r(30, 15, 2, 2, "#ffffff");
    r(21, 20, 5, 3, "#b96362");
    r(23, 23, 2, 2, "#74524a");
    r(7, 13, 5, 3, "#a96d43");
    r(17, 6, 4, 6, "#ac7142");
    r(25, 6, 4, 6, "#ac7142");
    ctx.restore();
  }

  function draw() {
    background();
    ctx.save();
    ctx.translate(-Math.round(camera), 0);
    for (let i = 0; i < trees.length; i++) {
      if (trees[i] > camera - 150 && trees[i] < camera + W + 150) tree(trees[i], i);
    }
    for (const x of benches) if (x > camera - 90 && x < camera + W + 90) bench(x);
    for (const x of [530, 1810, 2750, 4010]) if (x > camera - 40 && x < camera + W + 40) lamp(x);
    groundTiles();
    for (let i = 0; i < 88; i++) {
      const x = 35 + i * 53 + Math.floor(rand(i) * 19);
      if (x < camera - 20 || x > camera + W + 20) continue;
      if (ground.some(([start, end]) => x > start + 15 && x < end - 15)) {
        if (i % 3 === 0) flower(x, i % 2 ? "#f2aa85" : "#f9e4a6");
        else {
          rect(x, GROUND - 6, 3, 6, "#4d9868");
          rect(x + 5, GROUND - 9, 3, 9, "#68b87a");
        }
      }
    }
    for (const x of checkpoints) flag(x, checkpoint >= x);
    picnic();
    for (const block of obstacles) if (block.x > camera - 80 && block.x < camera + W + 80) obstacle(block);
    for (const hazard of hazards) if (hazard.x > camera - 80 && hazard.x < camera + W + 80) bramble(hazard);
    for (const item of fish) if (item.x > camera - 40 && item.x < camera + W + 40) snack(item);
    cat();
    ctx.restore();
  }

  function frame(timestamp) {
    const dt = Math.min((timestamp - lastFrame) / 1000 || 0, 0.033);
    lastFrame = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  document.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault();
    if (event.code === "ArrowLeft") keys.left = true;
    if (event.code === "ArrowRight") keys.right = true;
    if ((event.code === "Space" || event.code === "ArrowUp") && !event.repeat) {
      if (mode === "intro") reset();
      else jump();
    }
    if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) pause();
    if (event.code === "KeyR" && !event.repeat) reset();
    if (event.code === "Enter" && !event.repeat) {
      if (mode === "intro" || mode === "lost" || mode === "won") reset();
      else if (mode === "paused") pause();
    }
  });
  document.addEventListener("keyup", event => {
    if (event.code === "ArrowLeft") keys.left = false;
    if (event.code === "ArrowRight") keys.right = false;
  });
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "playing") pause();
  });

  ui.button.addEventListener("click", () => mode === "paused" ? pause() : reset());
  document.querySelector("#restart-button").addEventListener("click", reset);
  ui.sound.addEventListener("click", () => {
    soundOn = !soundOn;
    ui.sound.innerHTML = `♪ <span>${soundOn ? "ON" : "OFF"}</span>`;
    ui.sound.setAttribute("aria-label", soundOn ? "Mute sound" : "Unmute sound");
    if (soundOn) tone(520, 0.08);
  });
  for (const button of document.querySelectorAll("[data-control]")) {
    const control = button.dataset.control;
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (control === "jump") jump();
      else keys[control] = true;
    });
    const release = () => { if (control !== "jump") keys[control] = false; };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  updateHud();
  requestAnimationFrame(frame);
})();
