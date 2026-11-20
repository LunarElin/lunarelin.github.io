(function (JD) {
  'use strict';

  JD.createInput = function (canvas, actionButton, controls) {
    let pointer = null;
    let chargeKey = null;
    let shift = false;

    function position(ev) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - rect.left) * 392 / rect.width,
        y: (ev.clientY - rect.top) * 640 / rect.height
      };
    }

    function over(point, x, y, width, height) {
      return point.x >= x && point.x < x + width && point.y >= y && point.y < y + height;
    }

    function cardAt(point, state) {
      return JD.UI.cards(state).findIndex(card => over(point, card.x, card.y, card.w, card.h));
    }

    function pointerDown(ev) {
      if (pointer || controls.isBlocked() || ev.button !== 0) return;
      const state = controls.snapshot();
      const target = ev.currentTarget;
      if (state.state === 'AIM' && (chargeKey !== null || state.charging)) return;
      pointer = { id: ev.pointerId, target, kind: state.state, card: -1 };
      controls.activateAudio();
      target.focus({ preventScroll: true });
      if (target.setPointerCapture) {
        try { target.setPointerCapture(ev.pointerId); } catch (_) { /* The pointer may have ended. */ }
      }
      if (ev.cancelable) ev.preventDefault();

      if (state.state === 'AIM') {
        pointer.kind = 'charge';
        controls.queue({ type: 'hold' });
      } else if (state.state === 'CARD') {
        pointer.card = cardAt(position(ev), state);
        if (pointer.card !== -1) controls.focus(pointer.card);
      }
    }

    function pointerUp(ev) {
      if (!pointer || pointer.id !== ev.pointerId) return;
      const press = pointer;
      pointer = null;
      if (controls.isBlocked()) return;

      const state = controls.snapshot();
      if (press.kind === 'charge') {
        controls.queue({ type: 'release' });
      } else if (press.kind === 'PAYOUT' && state.state === 'PAYOUT') {
        controls.queue({ type: 'skip' });
      } else if (press.kind === 'CARD' && state.state === 'CARD' && press.card >= 0 && cardAt(position(ev), state) === press.card) {
        controls.queue({ type: 'pick', index: press.card });
      }
    }

    function pointerCancel(ev) {
      if (!pointer || pointer.id !== ev.pointerId) return;
      const wasCharging = pointer.kind === 'charge';
      pointer = null;
      if (wasCharging) controls.cancel();
    }

    function pointerMove(ev) {
      if (pointer || ev.pointerType !== 'mouse' || controls.isBlocked()) return;
      const state = controls.snapshot();
      if (state.state === 'CARD') {
        const index = cardAt(position(ev), state);
        if (index !== -1) controls.focus(index);
      }
    }

    function cycle(index, direction, length) {
      return (index + direction + length) % length;
    }

    function cycleSpring(state, direction) {
      if (state.charging || state.springs.length < 2) return;
      const choices = [];
      state.springs.forEach(spring => {
        if (spring === 'spin') {
          choices.push({ spring, spin: -1 }, { spring, spin: 1 });
        } else {
          choices.push({ spring, spin: 0 });
        }
      });
      const current = choices.findIndex(choice => choice.spring === state.pick.spring && choice.spin === state.pick.spin);
      controls.queue(Object.assign({ type: 'pickSpring' }, choices[cycle(current, direction, choices.length)]));
    }

    function keyDown(ev) {
      if (controls.isBlocked() || ev.altKey || ev.metaKey || ev.ctrlKey) return;
      if (ev.target !== actionButton && ev.target instanceof Element &&
          ev.target.closest('a, button, input, select, textarea, [contenteditable]')) return;
      const key = ev.key;
      const action = key === ' ' || key === 'Enter';
      const arrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(key);
      const mute = key === 'm' || key === 'M';
      const directCard = ['1', '2', '3'].indexOf(key);
      const state = controls.snapshot();
      const cardMove = state.state === 'CARD' && arrow >= 0;
      if (!action && arrow < 0 && !mute && !cardMove && directCard < 0 && key !== 'Shift') return;
      if (key !== 'Shift') ev.preventDefault();
      if (ev.repeat) return;
      controls.activateAudio();

      if (mute) {
        controls.toggleMute();
      } else if (key === 'Shift') {
        shift = state.state === 'FLIGHT';
      } else if (state.state === 'AIM') {
        if (action && chargeKey === null && !(pointer && pointer.kind === 'charge') && !state.charging) {
          chargeKey = key;
          controls.queue({ type: 'hold' });
        } else if (arrow === 0 || arrow === 1) {
          if (!state.charging && state.stage > 1 && state.rack.length > 1) {
            controls.queue({ type: 'pickBall', slot: cycle(state.slot, arrow === 0 ? -1 : 1, state.rack.length) });
          }
        } else if (arrow >= 2) {
          cycleSpring(state, arrow === 2 ? -1 : 1);
        }
      } else if (state.state === 'PAYOUT' && action) {
        controls.queue({ type: 'skip' });
      } else if (state.state === 'CARD') {
        if (cardMove) {
          const direction = arrow % 2 === 0 ? -1 : 1;
          controls.focus(cycle(controls.focused(), direction, state.offer.length));
        } else if (action || directCard >= 0) {
          controls.queue({ type: 'pick', index: action ? controls.focused() : directCard });
        }
      } else if (state.state === 'RESULT' && action) {
        controls.queue({ type: 'restart' });
      }
    }

    function keyUp(ev) {
      if (ev.key === 'Shift') shift = false;
      if (ev.key !== chargeKey) return;
      chargeKey = null;
      ev.preventDefault();
      if (!controls.isBlocked()) controls.queue({ type: 'release' });
    }

    // Assistive technologies can activate a button without dispatching pointer or key events.
    actionButton.addEventListener('click', ev => {
      if (ev.detail !== 0 || pointer || chargeKey !== null || controls.isBlocked()) return;
      const state = controls.snapshot();
      controls.activateAudio();
      if (state.state === 'AIM') controls.queue({ type: state.charging ? 'release' : 'hold' });
      else if (state.state === 'PAYOUT') controls.queue({ type: 'skip' });
    });

    for (const target of [canvas, actionButton]) {
      target.addEventListener('pointerdown', pointerDown, { passive: false });
      target.addEventListener('lostpointercapture', pointerCancel);
      target.addEventListener('contextmenu', ev => ev.preventDefault());
    }
    canvas.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    return {
      fast() { return shift || (pointer !== null && pointer.kind === 'FLIGHT'); },
      reset() {
        const press = pointer;
        pointer = null;
        chargeKey = null;
        shift = false;
        if (press && press.target.hasPointerCapture?.(press.id)) press.target.releasePointerCapture(press.id);
      }
    };
  };
}(window.JD));
