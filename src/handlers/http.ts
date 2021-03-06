import {
  Core as Webda,
  SecureCookie,
  ClientInfo,
  MemoryLogger,
  _extend,
  HttpContext
} from "webda";
const path = require("path");

export class WebdaServer extends Webda {
  private _http: any;
  private _io: any;
  protected _devMode: boolean;
  protected _staticIndex: string;

  logRequest(...args) {
    this.log("REQUEST", ...args);
  }

  output(...args) {
    this.log("CONSOLE", ...args);
  }

  getClientInfo(req): ClientInfo {
    let res = new ClientInfo();
    res.ip = req.connection.remoteAddress;
    res.userAgent = req.headers["user-agent"];
    res.locale = req.headers["Accept-Language"];
    res.referer = req.headers["Referer"];
    return res;
  }

  async handleRequest(req, res, next) {
    try {
      // Wait for Webda to be ready
      await this.init();

      // Handle reverse proxy
      var vhost = req.headers.host.match(/:/g)
        ? req.headers.host.slice(0, req.headers.host.indexOf(":"))
        : req.headers.host;
      if (req.hostname !== undefined) {
        vhost = req.hostname;
      }
      if (req.headers["x-forwarded-host"] !== undefined) {
        vhost = req.headers["x-forwarded-host"];
      }
      var protocol = req.protocol;
      if (req.headers["x-forwarded-proto"] !== undefined) {
        protocol = req.headers["x-forwarded-proto"];
      }

      let method = req.method;

      // TODO Remove it in Webda 1.x -> this is for compatibility reason
      if (method === "PUT" && req.headers["x-webda-method"] !== "PUT") {
        method = "PATCH";
      }
      let port;
      if (req.socket && req.socket.address()) {
        port = req.socket.address().port;
      }
      let url = req.url || "";
      if (url.endsWith("?")) {
        url = url.substr(0, url.length - 1);
      }
      let httpContext = new HttpContext(
        vhost,
        method,
        url,
        protocol,
        port,
        req.body,
        req.headers,
        req.files
      );
      let ctx = await this.newContext(httpContext, res, true);
      ctx.clientInfo = this.getClientInfo(req);

      var executor = this.getExecutorWithContext(ctx);
      if (executor == null) {
        let routes = this.getRouteMethodsFromUrl(req.url);
        if (routes.length == 0) {
          return next();
        }
      }

      await ctx.init();
      req.session = ctx.getSession().getProxy();

      // Setup the right session cookie
      //req.session.cookie.domain = vhost;

      // Fallback on reference as Origin is not always set by Edge
      let origin =
        req.headers.Origin || req.headers.origin || req.headers.Referer;
      // Set predefined headers for CORS
      if (this._devMode || (await this.checkCSRF(ctx))) {
        if (origin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
      } else {
        // Prevent CSRF
        this.log("INFO", "CSRF denied from", origin);
        res.writeHead(401);
        res.end();
        return;
      }

      if (protocol === "https") {
        // Add the HSTS header
        res.setHeader(
          "Strict-Transport-Security",
          "max-age=31536000; includeSubDomains; preload"
        );
      }
      if (req.method === "OPTIONS") {
        // Add correct headers for X-scripting
        if (req.headers["x-forwarded-server"] === undefined) {
          if (this._devMode && req.headers["origin"]) {
            res.setHeader("Access-Control-Allow-Origin", req.headers["origin"]);
          }
        }
        let routes = this.getRouteMethodsFromUrl(req.url);
        if (routes.length == 0) {
          ctx.statusCode = 404;
          res.writeHead(404);
          res.end();
          return;
        }
        routes.push("OPTIONS");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Headers",
          req.headers["access-control-request-headers"] || "content-type"
        );
        res.setHeader("Access-Control-Allow-Methods", routes.join(","));
        res.setHeader("Access-Control-Max-Age", 86400);
        res.setHeader("Allow", routes.join(","));
        res.writeHead(200);
        res.end();
        return;
      }
      await this.emitSync(
        "Webda.Request",
        vhost,
        method,
        req.url,
        ctx.getCurrentUserId(),
        req.body,
        req,
        ctx
      );

      // Add correct headers for X-scripting
      if (req.headers["x-forwarded-server"] === undefined) {
        if (this._devMode && req.headers["origin"]) {
          res.setHeader("Access-Control-Allow-Origin", req.headers["origin"]);
        }
      }
      res.setHeader("Access-Control-Allow-Credentials", "true");
      try {
        await executor.execute(ctx);
        await this.emitSync("Webda.Result", ctx);
        if (!ctx._ended) {
          await ctx.end();
        }
      } catch (err) {
        await this.emitSync("Webda.Result", ctx);
        if (typeof err === "number") {
          ctx.statusCode = err;
          this.flushHeaders(ctx);
          return res.end();
        } else {
          this.output(
            "ERROR Exception occured : " + JSON.stringify(err),
            err.stack
          );
          res.writeHead(500);
          res.end();
          throw err;
        }
      }
    } catch (err) {
      res.writeHead(500);
      this.output(
        "ERROR Exception occured : " + JSON.stringify(err),
        err.stack
      );
      res.end();
    }
  }

  display404(res) {
    res.writeHead(404, {
      "Content-Type": "text/plain"
    });
    res.write("Webda doesn't know this host or mapping");
    res.end();
  }

  updateSecret() {}

  flushHeaders(ctx) {
    var res = ctx._stream;
    var headers = ctx.getResponseHeaders();
    let cookies = ctx.getResponseCookies();
    for (let i in cookies) {
      res.cookie(cookies[i].name, cookies[i].value, cookies[i].options);
    }
    res.writeHead(ctx.statusCode, headers);
  }

  flush(ctx) {
    var res = ctx._stream;
    if (ctx._body !== undefined) {
      res.write(ctx._body);
    }
    res.end();
  }

  handleStaticIndexRequest(req, res, next) {
    res.sendFile(this._staticIndex);
  }

  serveStaticWebsite(express, app) {
    if (this.getGlobalParams().website && this.getGlobalParams().website.path) {
      this.output(this.getGlobalParams().website.path);
      app.use(express.static(this.getGlobalParams().website.path));
    }
  }

  serveIndex(express, app) {
    if (this.getGlobalParams().website && this.getGlobalParams().website.path) {
      let index = this.getGlobalParams().website.index || "index.html";
      this._staticIndex = path.resolve(index);
      app.get("*", this.handleStaticIndexRequest.bind(this));
    }
  }

  async serve(port, websockets: boolean = false): Promise<Object> {
    var http = require("http");

    var express = require("express");
    var cookieParser = require("cookie-parser");
    var bodyParser = require("body-parser");
    var multer = require("multer"); // v1.0.5
    var upload = multer(); // for parsing multipart/form-data

    var requestLimit = this.getGlobalParams().requestLimit
      ? this.getGlobalParams().requestLimit
      : "20mb";
    var app = express();
    app.disable("x-powered-by");
    app.use(cookieParser());
    app.use(
      bodyParser.text({
        type: "text/plain"
      })
    );
    app.use(
      bodyParser.json({
        limit: requestLimit
      })
    );
    app.use(
      bodyParser.urlencoded({
        extended: true
      })
    );
    app.use(upload.array("file"));
    // Will lower the limit soon, we should have a library that handle multipart file
    app.use(
      bodyParser.raw({
        type: "*/*",
        limit: requestLimit
      })
    );

    app.set("trust proxy", "loopback, 10.0.0.0/8");

    app.use(this.handleRequest.bind(this));
    this.serveStaticWebsite(express, app);

    this._http = http.createServer(app).listen(port);
    if (websockets) {
      // Activate websocket
      this.output("Activating socket.io");
      this._io = require("socket.io")(this._http);
      this.emit("Webda.Init.SocketIO", this._io);
    }
    this.serveIndex(express, app);
    this.output("Server running at http://0.0.0.0:" + port);
    return new Promise(() => {});
  }
}
