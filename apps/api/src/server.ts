import { ConfigurationError, parseEnvironment } from './config/environment.js';
import { startApi } from './runtime.js';
import { parseAuthEnvironment } from './config/auth-environment.js';

try {
  const runtime = await startApi(parseEnvironment(), undefined, parseAuthEnvironment());
  console.info('API_INICIADA: processo HTTP disponível.');
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void runtime
      .close()
      .then(() => {
        console.info('API_ENCERRADA: recursos libertados.');
        process.exit(0);
      })
      .catch(() => {
        console.error('API_ENCERRAMENTO_FALHOU: não foi possível concluir o encerramento.');
        process.exit(1);
      });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(`CONFIGURACAO_INVALIDA: verifique ${error.campos.join(', ')}.`);
  } else {
    console.error('API_ARRANQUE_FALHOU: verifique o ambiente e a disponibilidade dos serviços.');
  }
  process.exitCode = 1;
}
