# Incremunica SPARQL jQuery Widget
[<img src="https://github.com/user-attachments/assets/8b41f58a-dd43-4555-8b1f-29f0dfd5b736" width="200" align="right" alt="" />](https://github.com/comunica/incremunica/)

**[Try the _Incremunica SPARQL jQuery Widget_ online.](https://maartyman.github.io/Incremunica-Client/)**

This is a modified version of the [comunica jQuery widget](https://github.com/comunica/jQuery-Widget.js) to use the [Incremunica SPARQL client](https://github.com/comunica/incremunica/tree/master/engines/query-sparql-incremental) and allow for incremental updates of the query results.

### Run from git sources

Configure your widget by editing the [settings.json](https://github.com/comunica/jQuery-Widget.js/blob/master/settings.json) file.

Next, edit the [queries directory](https://github.com/comunica/jQuery-Widget.js/tree/master/queries) in which you should insert the queries that will be present by default in the widget.

Build the [Docker](https://www.docker.com/) container as follows:

```bash
docker build -t comunica-sparql-widget .
```

After that, you can run your newly created container by mounting your current folder to the Docker container:
```bash
docker run -p 3000:80 -it --rm comunica-sparql-widget
```

Settings and queries can be passed at runtime by mounting your custom `queries.json` to the Docker container:

```bash
# Compile queries.json from settings.json and the files in the queries folder
./bin/queries-to-json.js

# Provide the compiled queries.json at runtime
docker run -v $(pwd)/queries.json:/usr/share/nginx/html/queries.json -p 3000:80 -it --rm comunica-sparql-widget
```

> Access on http://localhost:3000

## For developers of this package

The following is only relevant for developers that contribute to this package.

### Using the code

- Run `yarn install` to fetch dependencies and build the browser version of the client code.
- Run `yarn run dev` to run a local Web server (`yarn run dev-prod` for minified production output).
- Edit datasources in `settings.json` and queries in the `queries` folder, and run `queries-to-json` to compile both of them in a single JSON file.
- Run `yarn run build` to generate a production version in the `build` folder.

### How the browser client works

The original _Comunica SPARQL_ engine is written for the Node.js environment. The [Webpack](https://webpack.js.org/) library makes it compatible with browsers.

The query engine itself runs in a background thread using [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). The user interface (`ldf-client-ui.js`) instructs the worker (`ldf-client-worker.js`) to evaluate queries by sending messages, and the worker sends results back.

## License

The Linked Data Fragments jQuery Widget was originally written by [Ruben Verborgh](https://ruben.verborgh.org/)
and ported for Comunica SPARQL by [Ruben Taelman](http://rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
