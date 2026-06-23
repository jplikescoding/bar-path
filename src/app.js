import { initialData } from './state';
export class App {
    constructor(root) {
        this.root = root;
        this.data = initialData();
        this.screens = new Map();
    }
    register(screen, fn) {
        this.screens.set(screen, fn);
    }
    go(screen) {
        const fn = this.screens.get(screen);
        if (!fn)
            throw new Error(`No screen registered: ${screen}`);
        this.root.innerHTML = '';
        fn(this, this.root);
    }
    reset() {
        this.data = initialData();
    }
}
