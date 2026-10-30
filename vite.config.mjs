import { defineConfig } from 'vite';
export default defineConfig({base:'./', server:{host:'127.0.0.1',port:5188,strictPort:true,watch:{ignored:['**/release/**','**/qa/**','**/.test-data/**']}},build:{outDir:'dist',emptyOutDir:true}});
