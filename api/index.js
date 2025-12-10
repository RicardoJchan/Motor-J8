import express from 'express';
import { MongoClient } from 'mongodb';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simulated storage - no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jchan';
const PORT = process.env.PORT || 3000;

let db;

async function connectDB() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    db = client.db();
    console.log('Connected to MongoDB');
    
    // Initialize boards if they don't exist
    const boards = await db.collection('boards').find().toArray();
    if (boards.length === 0) {
      await db.collection('boards').insertMany([
        { name: 'b', title: 'Random Board' },
        { name: 'soybr', title: 'Brazil Board' }
      ]);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);

  }
}

// Optimize and create thumbnail from buffer
async function processImage(buffer) {
  const optimized = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();

  const thumbnail = await sharp(buffer)
    .resize(250, 250, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  return {
    optimized: `data:image/webp;base64,${optimized.toString('base64')}`,
    thumbnail: `data:image/webp;base64,${thumbnail.toString('base64')}`
  };
}

// Routes
app.get('/api/boards', async (req, res) => {
  try {
    const boards = await db.collection('boards').find().toArray();
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/:board/threads', async (req, res) => {
  try {
    const threads = await db.collection('threads')
      .find({ board: req.params.board })
      .sort({ bumpedAt: -1 })
      .limit(10)
      .toArray();
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/:board/post', upload.single('image'), async (req, res) => {
  try {
    const { board } = req.params;
    const { text, title } = req.body;
    
    let imageData;
    if (req.file) {
      imageData = await processImage(req.file.buffer);
    }

    const thread = {
      board,
      title,
      text,
      image: imageData?.optimized || null,
      thumbnail: imageData?.thumbnail || null,
      createdAt: new Date(),
      bumpedAt: new Date(),
      replies: []
    };

    const result = await db.collection('threads').insertOne(thread);
    res.json({ ...thread, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connect to DB and start serverless export
connectDB().then(() => {
  console.log(`Server ready at port ${PORT}`);
});

module.exports = app;
