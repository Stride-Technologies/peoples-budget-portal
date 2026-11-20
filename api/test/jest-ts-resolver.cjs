const path = require('node:path');

module.exports = (request, options) => {
  if (request.endsWith('.js') && !options.basedir.includes(`${path.sep}node_modules${path.sep}`)) {
    const tsRequest = request.replace(/\.js$/, '.ts');
    try {
      return options.defaultResolver(tsRequest, options);
    } catch {}
  }

  return options.defaultResolver(request, options);
};
