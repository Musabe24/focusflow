function startTimer() {
  let remaining = 25 * 60;
  updateDisplay(remaining);
  const interval = setInterval(() => {
    remaining--;
    updateDisplay(remaining);
    if (remaining <= 0) {
      clearInterval(interval);
      document.getElementById('duration').value = 25 * 60;
      document.getElementById('sessionForm').submit();
    }
  }, 1000);
}

function updateDisplay(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  document.getElementById('timer').textContent = `${m}:${s}`;
}

document.getElementById('start').addEventListener('click', startTimer);
