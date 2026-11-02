# Build:  docker build -f deploy/Dockerfile -t ka2-atlas .   (run from app/; site/src/data must already be exported)
# Run:    docker run --rm -p 8080:8080 ka2-atlas
FROM node:22.23.4-alpine AS build
WORKDIR /site
COPY site/package*.json ./
RUN npm ci
COPY site/ ./
ARG SITE_BASE=/
ARG SITE_URL=
ENV SITE_BASE=$SITE_BASE SITE_URL=$SITE_URL
RUN npx astro build

FROM nginxinc/nginx-unprivileged:1.27-alpine
# nginx.conf is a template: the official image fills in ${ASK_API_URL} at start (only variables starting with ASK_)
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
ENV ASK_API_URL=http://127.0.0.1:8000 ASK_AUTH=off NGINX_ENVSUBST_FILTER=^ASK_
COPY deploy/security_headers.inc /etc/nginx/conf.d/security_headers.inc
COPY --from=build /site/dist /usr/share/nginx/html
EXPOSE 8080
