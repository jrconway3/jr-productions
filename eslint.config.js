import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextCoreWebVitals,
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'public/assets/**'],
  },
];

export default config;
