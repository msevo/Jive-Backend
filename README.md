# Jive-Backend

Jive is a live streaming platform for musicians. As the technical co-founder, I was responsible for designing and developing the technological infrastructure of the Jive web app.

**Backend Server**  
I chose to implement the backend server with Node.js. Its non-blocking, event-driven I/O allows it to remain lightweight and efficient in the face of data-intensive real-time applications like Jive. I used Socket.io to create chat rooms w/ websockets, and implemented a payment ecosystem w/ Stripe Connect. The server was deployed on a single AWS EC2 instance. I scaled the instance vertically to keep up with user growth in order to keep costs and complexity low, while still retaining high performance.

**Database Design**  
PostgreSQL was a natural fit for Jive because of its high concurrency, ACID-compliance, and Jive's naturally relational data. I hosted the database on AWS RDS, used Knex.js as a SQL query builder, and stored user image and video content in AWS S3 buckets. In order to prevent attacks such as SQL injections, I sanitized all user input before running it in a query. For user authentication security, I first salted and hashed all passwords w/ the bcrypt Node.js library before storing them in the DB.

**Live Streaming**  
I implemented live video streaming for Jive using the Wowza Live Streaming Engine. A Wowza server deployed on AWS ingested RTMP streams (sourced from video broadcast software) and transcoded them into HLS for browser playback. The live streams were recorded and stored in an S3 bucket, which would trigger an AWS Lambda Function that captures and saves live stream thumbnails. When live streams began, the server would send push notifications to client-side service workers to notify users.
