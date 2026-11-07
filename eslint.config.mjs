import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", ".open-next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
