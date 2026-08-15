/**
 * Top-down minimap: where you are, where the diamonds are, and — flashing — the
 * shop the current mission wants you to visit.
 *
 * The static layer (walkways, shop blocks, planters) is drawn once into an
 * offscreen canvas; each frame only redraws the moving dots on top.
 */
import { GRID_W, GRID_H, TILE, WORLD_W, WORLD_H } from './config.js';

export function createMinimap(canvas, mall) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width; // square canvas
  const cell = S / Math.max(GRID_W, GRID_H);
  const offX = (S - GRID_W * cell) / 2;
  const offZ = (S - GRID_H * cell) / 2;

  const worldToMapX = (wx) => offX + ((wx + WORLD_W / 2) / TILE) * cell;
  const worldToMapZ = (wz) => offZ + ((wz + WORLD_H / 2) / TILE) * cell;

  /* ------------------------------------------------- static background -- */

  const base = document.createElement('canvas');
  base.width = base.height = S;
  const bctx = base.getContext('2d');

  bctx.fillStyle = 'rgba(28, 10, 48, 0.85)';
  bctx.fillRect(0, 0, S, S);

  // Walkways.
  bctx.fillStyle = '#efe4fb';
  for (let z = 0; z < GRID_H; z++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!mall.isSolid(x, z)) {
        bctx.fillRect(offX + x * cell, offZ + z * cell, cell + 0.6, cell + 0.6);
      }
    }
  }

  // Planted maze islands sit on top of the walkway layer.
  bctx.fillStyle = '#8fc79a';
  for (const seg of mall.plugged) {
    bctx.fillRect(offX + seg.x * cell, offZ + seg.z * cell, seg.w * cell, seg.h * cell);
  }

  // Shop blocks, muted towards white so the player and target markers stay the
  // most saturated things on the map.
  for (const shop of mall.shops) {
    const mute = (v) => ((v * 0.45 + 0.5) * 255) | 0;
    bctx.fillStyle = `rgb(${mute(shop.color.r)},${mute(shop.color.g)},${mute(shop.color.b)})`;
    bctx.fillRect(
      offX + shop.block.x * cell,
      offZ + shop.block.z * cell,
      4 * cell,
      4 * cell,
    );
  }

  bctx.strokeStyle = 'rgba(255,255,255,0.25)';
  bctx.lineWidth = 2;
  bctx.strokeRect(1, 1, S - 2, S - 2);

  /* ------------------------------------------------------- live layer -- */

  let clock = 0;

  return {
    draw(dt, player, diamonds, target) {
      clock += dt;
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(base, 0, 0);

      // Diamonds.
      for (const p of diamonds.points) {
        if (!p.active || p.scale < 0.5) continue;
        ctx.fillStyle = p.kind === 'purple' ? '#c39bff' : '#ff8ad4';
        ctx.beginPath();
        ctx.arc(worldToMapX(p.x), worldToMapZ(p.z), cell * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }

      // Target shop: pulsing ring plus a permanent dot, so it reads at a glance.
      if (target) {
        const tx = worldToMapX(target.doorWorld.x);
        const tz = worldToMapZ(target.doorWorld.z);
        const pulse = (clock % 1.1) / 1.1;

        ctx.strokeStyle = `rgba(255, 236, 120, ${1 - pulse})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(tx, tz, cell * (1.1 + pulse * 3), 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#fff07a';
        ctx.strokeStyle = '#5a3a00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, tz, cell * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Player: a chevron pointing where they are heading.
      const px = worldToMapX(player.position.x);
      const pz = worldToMapZ(player.position.z);
      const heading = player.character.group.rotation.y;

      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-heading + Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2a1145';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -cell * 1.5);
      ctx.lineTo(cell * 1.1, cell * 1.2);
      ctx.lineTo(0, cell * 0.55);
      ctx.lineTo(-cell * 1.1, cell * 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  };
}
