"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entryPoint = void 0;
const entryPoint = (req, res) => {
    const basePath = req.proxyUrl || req.baseUrl;
    res.render('index', {
        basePath,
    });
};
exports.entryPoint = entryPoint;
//# sourceMappingURL=index.js.map