import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
    {files: ["**/*.ts"]},
    {files: ["**/*.ts"], languageOptions: {globals: globals.node}},
    js.configs.recommended,
    ...tseslint.configs.recommended,
]);
