/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'scope-required-for-feat-fix': ({ type, scope }) => {
          if ((type === 'feat' || type === 'fix') && !scope) {
            return [false, 'scope is required for feat and fix commits'];
          }
          return [true, ''];
        },
      },
    },
  ],
  rules: {
    'scope-required-for-feat-fix': [2, 'always'],
  },
};
