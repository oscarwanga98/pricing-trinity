# Use the official Node.js image as a base
FROM node:18

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Set environment variables from .env file
# You can remove this if not using a .env file
ENV NODE_ENV=production

# Start the application
CMD [ "npm", "start" ]
