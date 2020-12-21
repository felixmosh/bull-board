"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useScrolled = void 0;
const react_1 = require("react");
const useScrolled = () => {
    const [scrolled, setScrolled] = react_1.useState(typeof window === 'undefined' ? false : window.scrollY > 20);
    react_1.useEffect(() => {
        let timeout;
        function handleScroll() {
            if (timeout) {
                window.cancelAnimationFrame(timeout);
            }
            timeout = window.requestAnimationFrame(() => {
                setScrolled(window.scrollY > 20);
            });
        }
        window.addEventListener('scroll', handleScroll, false);
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    });
    return scrolled;
};
exports.useScrolled = useScrolled;
//# sourceMappingURL=useScrolled.js.map