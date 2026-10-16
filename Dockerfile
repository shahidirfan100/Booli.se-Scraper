FROM apify/actor-node-playwright-chrome:22-1.64.1

COPY --chown=myuser:myuser package*.json ./

# Install production dependencies. The image supports XVFB, so a real browser
# window can run for Cloudflare-protected pages.
RUN npm --quiet set progress=false \
	&& npm install --omit=dev \
	&& echo "Installed NPM packages:" \
	&& (npm list --omit=dev --all || true) \
	&& echo "Node.js version:" \
	&& node --version \
	&& echo "NPM version:" \
	&& npm --version \
	&& rm -r ~/.npm

COPY --chown=myuser:myuser . ./

ENV APIFY_LOG_LEVEL=INFO

CMD ["npm", "start", "--silent"]
