# Use Node.js 20 slim image for a smaller footprint
FROM node:20-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the backend package files first to leverage Docker cache
COPY backend/package*.json ./backend/

# Install production dependencies
RUN cd backend && npm install --production

# Copy the entire backend and frontend directories
# This is necessary because backend/index.js serves files from ../frontend/
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Expose the port your Express app uses
EXPOSE 3000

# Start the application
CMD ["node", "backend/index.js"]
