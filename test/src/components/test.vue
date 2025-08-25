<template>
  <div>
    <h1>Vue Test: {{ t('hello') }} {{ t('123.a') }}</h1>
  </div>
</template>

<script setup lang="ts">
import { createClientTranslator } from '../../../src/client.js';
import type { Translations } from '../../../src/index.js';

interface Props {
  translations: Translations;
}

const props = defineProps<Props>();
const t = createClientTranslator(props.translations);
</script>