module.exports = {
  extends: 'airbnb-base',
  parserOptions: {
    ecmaVersion: 2022,
  },
  env: {
    node: true,
  },
  settings: {
    'import/extensions': ['.js'],
  },
  rules: {
    'max-len': 0,
    'no-console': 0,
    'object-curly-newline': 0,
    'no-await-in-loop': 0,
    'no-promise-executor-return': 0,
    'import/extensions': ['error', 'ignorePackages'],
  },
};
