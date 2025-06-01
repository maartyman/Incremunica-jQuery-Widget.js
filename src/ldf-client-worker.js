var engine = null;
var RdfString = require('rdf-string');
var LoggerPretty = require('@comunica/logger-pretty').LoggerPretty;
var bindingsStreamToGraphQl = require('@comunica/actor-query-result-serialize-tree').bindingsStreamToGraphQl;
var ProxyHandlerStatic = require('@comunica/actor-http-proxy').ProxyHandlerStatic;
var WorkerToWindowHandler = require('@rubensworks/solid-client-authn-browser').WorkerToWindowHandler;
var QueryEngineBase = require('@comunica/actor-init-query').QueryEngineBase;
var isAddition = require('@incremunica/user-tools').isAddition;
var getBindingsIndex = require('@incremunica/user-tools').getBindingsIndex;
var QuerySourceIterator = require('@incremunica/user-tools').QuerySourceIterator;
var DeferredEvaluation = require('@incremunica/user-tools').DeferredEvaluation;

// The active fragments client and the current results
var resultsIterator;

// Set up logging
var logger = new LoggerPretty({ level: 'info' });
logger.log = function (level, color, message, data) {
  postMessage({ type: 'log', log: message + '\n' });
};

// Handler for authenticating fetch requests within main window
const workerToWindowHandler = new WorkerToWindowHandler(self);

var querySourceIterator = null;
var deferredEvaluation = null;

function initEngine(config) {
  // Create an engine lazily
  if (!engine)
    engine = new QueryEngineBase(require('my-comunica-engine')());

  config.context.pollingPeriod = parseInt(config.context.pollingPeriod, 10) || 10;

  // Set up a proxy handler
  if (config.context.httpProxy)
    config.context.httpProxyHandler = new ProxyHandlerStatic(config.context.httpProxy);

  // Set up a deferred eval trigger
  if (config.context.deferredEval) {
    deferredEvaluation = new DeferredEvaluation();
    config.context.deferredEvaluationTrigger = deferredEvaluation.events;
    delete config.context.deferredEval;
  }

  // Set up authenticated fetch
  if (config.context.workerSolidAuth)
    config.context.fetch = workerToWindowHandler.buildAuthenticatedFetch();

  // Transform query format to expected structure
  if (config.context.queryFormat)
    config.context.queryFormat = { language: config.context.queryFormat };

  querySourceIterator = new QuerySourceIterator({
    seedSources: config.context.sources,
    deletionCooldown: 500,
    distinct: true,
  });
  config.context.sources = [querySourceIterator];
}

// Handlers of incoming messages
var handlers = {
  // Execute the given query with the given options
  query: function (config) {
    initEngine(config);

    // Create a client to fetch the fragments through HTTP
    config.context.log = logger;
    engine.query(config.query, config.context)
      .then(async function (result) {
        // Post query metadata
        postMessage({ type: 'queryInfo', queryType: result.resultType });

        var bindings = result.resultType === 'bindings';
        var resultsToTree = config.resultsToTree;
        switch (result.resultType) {
        case 'quads':
          resultsIterator = await result.execute();
          break;
        case 'bindings':
          resultsIterator = await result.execute();
          break;
        case 'boolean':
          result.execute().then(function (exists) {
            postMessage({ type: 'result', result: exists });
            postMessage({ type: 'end' });
          }).catch(postError);
          break;
        case 'void':
          result.execute().then(function () {
            postMessage({ type: 'result', result: 'Done' });
            postMessage({ type: 'end' });
          }).catch(postError);
          break;
        }

        if (resultsIterator) {
          if (resultsToTree) {
            bindingsStreamToGraphQl(resultsIterator, result.context, { materializeRdfJsTerms: true })
              .then(function (results) {
                (Array.isArray(results) ? results : [results]).forEach(function (result) {
                  if (isAddition(result))
                    postMessage({ type: 'addition', result: { result: '\n' + JSON.stringify(result, null, '  ') } });
                  else
                    postMessage({ type: 'deletion', result: { result: '\n' + JSON.stringify(result, null, '  ') } });
                });
                postMessage({ type: 'end' });
              })
              .catch(postError);
          }
          else {
            resultsIterator.on('data', function (result) {
              let resultMessage = {
                type: isAddition(result) ? 'addition' : 'deletion',
              };
              resultMessage.index = getBindingsIndex(result);
              if (bindings)
                resultMessage.result = Object.fromEntries([...result].map(([key, value]) => [RdfString.termToString(key), RdfString.termToString(value)]));
              else
                resultMessage.result = RdfString.quadToStringQuad(result);
              postMessage(resultMessage);
            });
            resultsIterator.on('end', function () {
              postMessage({ type: 'end' });
            });
            resultsIterator.on('error', postError);
          }
        }
      }).catch(postError);
  },

  // Add or remove a data source
  dataSource: function ({ isAddition, value }) {
    if (querySourceIterator) {
      if (isAddition)
        querySourceIterator.addSource(value);
      else
        querySourceIterator.removeSource(value);
    }
    else
      postError(new Error('No data source available'));
  },

  // Trigger the deferred evaluation
  deferredTrigger: function () {
    if (deferredEvaluation)
      deferredEvaluation.triggerUpdate();
    else
      postError(new Error('Deferred evaluation not set'));
  },

  // Stop the execution of the current query
  stop: function () {
    if (resultsIterator) {
      resultsIterator.destroy();
      resultsIterator = null;
    }
    if (querySourceIterator) {
      querySourceIterator.destroy();
      querySourceIterator = null;
    }
  },

  // Obtain the foaf:name of a WebID
  getWebIdName: function ({ webId, context }) {
    const config = {
      query: `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name WHERE {
  <${webId}> foaf:name ?name.
}`,
      context: {
        ...context,
        'sources': [webId],
        // TODO: this can be removed once this issue is fixed: https://github.com/comunica/comunica/issues/950
        '@comunica/actor-rdf-resolve-hypermedia-links-traverse:traverse': false,
      },
    };
    initEngine(config);
    config.context.log = logger;
    engine.queryBindings(config.query, config.context)
      .then(function (result) {
        result.toArray({ limit: 1 })
          .then(bindings => {
            if (bindings.length > 0)
              postMessage({ type: 'webIdName', name: bindings[0].get('name').value });

            // Clear HTTP cache to make sure we re-fetch all next URL
            // TODO: this can be removed once this issue is fixed: https://github.com/comunica/comunica/issues/950
            engine.invalidateHttpCache();
          }).catch(postError);
      }).catch(postError);
  },
};

function postError(error) {
  error = { message: error.message || error.toString() };
  postMessage({ type: 'error', error: error });
}

// Send incoming message to the appropriate handler
self.onmessage = function (m) {
  if (workerToWindowHandler.onmessage(m))
    return;
  handlers[m.data.type](m.data);
};
