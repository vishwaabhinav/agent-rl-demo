// Audio Worklet Processor for capturing microphone audio
// This runs in a separate thread for low-latency audio processing

class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = options.processorOptions?.bufferSize || 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0];

    // Accumulate samples into buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];

      // When buffer is full, send it to the main thread
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage({
          type: "audio",
          audio: this.buffer.slice(),
        });
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
