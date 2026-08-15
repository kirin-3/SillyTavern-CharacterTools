import { extname } from 'node:path';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
            if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !isRelative || extname(specifier)) {
                throw error;
            }
            return nextResolve(`${specifier}.ts`, context);
        }
    },
});
