import './style.css';
import { App } from './app';
const root = document.querySelector('#app');
const app = new App(root);
const stub = (name, next) => app.register(name, (a, r) => {
    r.innerHTML = `<div class="min-h-screen grid place-items-center gap-4">
      <h1 class="text-xl">${name}</h1>
      ${next ? `<button id="next" class="px-4 py-2 rounded bg-blue-600">Next: ${next}</button>` : ''}
    </div>`;
    if (next)
        r.querySelector('#next').addEventListener('click', () => a.go(next));
});
stub('upload', 'setpoint');
stub('setpoint', 'processing');
stub('processing', 'result');
stub('result');
app.go('upload');
