FROM gcr.io/distroless/nodejs26-debian13

WORKDIR /app

COPY server/main.js server/game.js server/http_sse.js ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["main.js"]
