import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const bodyLimit = process.env.NEST_JSON_BODY_LIMIT?.trim() || "25mb";

    app.use(json({ limit: bodyLimit }));
    app.use(urlencoded({ extended: true, limit: bodyLimit }));

    // ✅ Habilita o CORS
    app.enableCors({
        origin: "*", // Em produção, mude para o domínio do seu front-end (ex: 'http://localhost:3000')
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true, // Permite envio de cookies/headers de autenticação
    });

    await app.listen(process.env.PORT || 3001, '0.0.0.0');
    console.log(`Telegram Service is running on: ${await app.getUrl()}`);
}
bootstrap();
