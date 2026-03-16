FROM apify/actor-node-playwright-camoufox:22-1.58.2

COPY --chown=myuser:myuser package*.json ./
RUN npm --quiet set progress=false \
	&& npm install --omit=dev \
	&& rm -r ~/.npm

COPY --chown=myuser:myuser . ./

ENV APIFY_LOG_LEVEL=INFO

CMD ["npm", "start", "--silent"]
