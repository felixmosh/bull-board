import {AppViewRoute, BullBoardQueues, ControllerHandlerReturnType, IServerAdapter, UIConfig} from "../../api/typings/app";
import ejs from "ejs";
import path from "path";


export class BunAdapter implements IServerAdapter {
    basePath: string | null;
    bullBoardQueues: any;
    uiConfig: any;
    routes: any;
    errorHandler: any;
    viewPath: any;
    staticPath: any;
    staticRoute: any;
    constructor(){
        this.staticRoute = null;
        this.staticPath = null;
        this.viewPath = null;
        this.errorHandler = null;
        this.basePath = null;
        this.uiConfig = {};
        this.routes = {};
        this.bullBoardQueues = null
    }

    setBasePath(path:string){
        this.basePath = path;
    }
    setQueues(queues: BullBoardQueues) {
        this.bullBoardQueues = queues;
        return this;
    }
    setViewsPath(path: string) {
        this.viewPath = path;
        return this;
    }
    setStaticPath(staticsRoute: string, staticsPath: string) {
        this.staticRoute = staticsRoute;
        this.staticPath = staticsPath;
        return this;
    }
    setEntryRoute(routeDef: AppViewRoute) {
        let entryPoints;
        if(!Array.isArray(routeDef.route)){
            entryPoints = [routeDef.route];
        }
        else{
            entryPoints = routeDef.route;
        }
        entryPoints.forEach((route) => {
            route = (this?.basePath ?? '') + route;
            if(!this.routes[route]){
                this.routes[route] = {};
            }
            let methods;
            if(!Array.isArray(routeDef.method)){
                methods = [routeDef.method];
            }else{
                methods = routeDef.method
            }
            methods.forEach((method) => {
                method = method.toUpperCase();
                this.routes[route][method] = async () => {
                    const { name: fileName , params } = routeDef.handler({
                        basePath: this.basePath || '',
                        uiConfig: this?.uiConfig ?? {},
                    })
                    const template = await ejs.renderFile(`${this.viewPath}/${fileName}`, params);
                    return new Response( template, { headers: { 'Content-Type': 'text/html' } });
                }
            })
        })

        return this;
    }
    setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType ) {
        this.errorHandler = handler;
        return this;
    }
    setApiRoutes(routes: any) {
        routes.forEach(({route, method, handler}: { route: string, method: string, handler: any}) => {
            route = (this?.basePath ?? '') + route;
            let methods;
            if(!Array.isArray(method)){
                methods = [method];
            }else{
                methods = method;
            }
            methods.forEach((method) => {
                method = method.toUpperCase();
                if(!this.routes[route]){
                    this.routes[route] = {};
                }
                this.routes[route][method] = async (req:any) => {
                    let reqBody = {};
                    if (method !== 'get') {
                        // Safely attempt to parse the request body, since the UI does not include a request body with most requests
                        try {
                            reqBody = await req.json();
                        } catch {}
                    }
                    const { searchParams } = new URL(req.url);
                    const query:any = {};
                    searchParams.forEach((value, key) => {
                        query[key] = value;
                    });
                    const response = await handler({ queues: this.bullBoardQueues, query: query, params: req.params, body: reqBody});

                    return Response.json(response.body,{status:response.status});
                }
            })

        });
        // handle Static files
        const staticBaseUrlPath = [this.basePath, this.staticRoute].join('/').replace(/\/{2,}/g, '/');
        this.routes[this.basePath + this.staticRoute + '/*'] = async (req: Request) => {
            const root = path.relative(process.cwd(), this.staticPath)
            const url = new URL(req.url).pathname;
            const urlPath =  url.replace(staticBaseUrlPath, '')
            const filePath = path.join(root, urlPath);
            return new Response(Bun.file(filePath));
        }
        return this;
    }
    setUIConfig(config:UIConfig){
        this.uiConfig = config;
        return this;
    }
}