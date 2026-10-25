let fft;
let audioFile;
let canvasContainer;
let fileInput;
let playButton;
let statusText;
let previousWidth;
let previousHeight;

let visualBass = 0;
let visualMids = 0;
let visualHighs = 0;
let bassSensitivity = 5;
let previousBassRaw = 0;
let bassBaseline = 0;
let beatCooldown = 0;
let previousHighRaw = 0;
let sparkCooldown = 0;
const branches = [];
const particles = [];
const maxBranches = 700;
const maxDepth = 5;
let visualTime = 0;

function setup() {
    canvasContainer = document.getElementById('visualizer-canvas');
    fileInput = document.getElementById('audio-file');
    playButton = document.getElementById('play-button');
    statusText = document.getElementById('status');

    pixelDensity(1);
    createCanvas(canvasContainer.clientWidth, canvasContainer.clientHeight).parent(canvasContainer);
    previousWidth = width;
    previousHeight = height;
    fft = new p5.FFT(512);
    resetStructure();

    fileInput.addEventListener('change', handleAudioSelection);
    playButton.addEventListener('click', handlePlayback);
}

function draw() {
    background(0);

    const isPlaying = audioFile && audioFile.isPlaying();
    const spectrum = isPlaying ? fft.analyze() : null;
    const bassRaw = spectrum ? getBassEnergy(spectrum) : 0;
    const mids = spectrum ? getBandPeak(spectrum, 6, 48) : 0;
    const highs = spectrum ? getBandPeak(spectrum, 48, 210) : 0;

    const frameSeconds = Math.min(deltaTime / 1000, 0.05);
    const bassTarget = constrain(bassRaw * bassSensitivity, 0, 1);
    visualBass = lerp(visualBass, bassTarget, bassTarget > visualBass ? 0.35 : 0.09);
    visualMids = lerp(visualMids, mids, 0.24);
    visualHighs = lerp(visualHighs, highs, 0.24);
    visualTime += frameSeconds * 2;
    beatCooldown = Math.max(0, beatCooldown - frameSeconds);
    sparkCooldown = Math.max(0, sparkCooldown - frameSeconds);

    const bassFlux = Math.max(0, bassRaw - previousBassRaw);
    const beatThreshold = Math.max(0.003, bassBaseline * 0.16);
    if (isPlaying && bassRaw > 0.025 && bassFlux > beatThreshold && beatCooldown <= 0) {
        const strength = constrain(bassTarget * 2 + bassFlux * bassSensitivity * 5, 0.12, 1);
        triggerBassShock(strength);
        beatCooldown = 0.18;
    }
    bassBaseline = lerp(bassBaseline, bassRaw, bassRaw > bassBaseline ? 0.025 : 0.08);
    previousBassRaw = bassRaw;

    const highTransient = Math.max(0, highs - previousHighRaw);
    previousHighRaw = highs;

    updateStructure(frameSeconds);
    updateParticles(frameSeconds, highTransient);
    drawCentralShape();
    drawStructure();
    drawParticles();
}

function getBandPeak(spectrum, startBin, endBin) {
    let peak = 0;
    for (let bin = startBin; bin < endBin; bin += 1) {
        peak = Math.max(peak, spectrum[bin]);
    }
    return Math.sqrt(peak);
}

function getBassEnergy(spectrum) {
    let energy = 0;
    let binCount = 0;

    for (let bin = 1; bin < spectrum.length; bin += 1) {
        const frequency = fft.analyzer.getFrequencyOfIndex(bin);
        if (frequency >= 20 && frequency <= 250) {
            energy += spectrum[bin] * spectrum[bin];
            binCount += 1;
        }
    }

    return binCount > 0 ? Math.sqrt(energy / binCount) : 0;
}

function resetStructure() {
    particles.length = 0;
    branches.length = 0;
    previousBassRaw = 0;
    bassBaseline = 0;
    beatCooldown = 0;
    previousHighRaw = 0;
    sparkCooldown = 0;
}

function triggerBassShock(strength) {
    const roots = 5 + Math.floor(strength * 7);
    for (let i = 0; i < roots && branches.length < maxBranches; i += 1) {
        const angle = random(TWO_PI);
        const vertical = random(-0.85, 0.85);
        const horizontal = Math.sqrt(1 - vertical * vertical);
        const direction = {
            x: Math.cos(angle) * horizontal,
            y: vertical,
            z: Math.sin(angle) * horizontal
        };
        const origin = {
            x: random(-0.035, 0.035) * Math.min(width, height),
            y: random(-0.035, 0.035) * Math.min(width, height),
            z: random(-0.08, 0.08) * Math.min(width, height)
        };
        createBranch(origin, direction, Math.min(width, height) * random(0.14, 0.25 + strength * 0.35), 0, strength);
    }
}

function createBranch(origin, direction, length, depth, energy) {
    const magnitude = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const normalizedDirection = {
        x: direction.x / magnitude,
        y: direction.y / magnitude,
        z: direction.z / magnitude
    };
    branches.push({
        x: origin.x,
        y: origin.y,
        z: origin.z,
        direction: normalizedDirection,
        length,
        depth,
        growth: 0,
        age: 0,
        lifetime: random(0.75, 1.5) * (0.7 + energy * 0.5),
        curve: random(-0.16, 0.16) * length,
        seed: random(1000),
        energy,
        split: false
    });
}

function updateStructure(frameSeconds) {
    for (let i = branches.length - 1; i >= 0; i -= 1) {
        const branch = branches[i];
        branch.age += frameSeconds;
        branch.growth = Math.min(1, branch.growth + frameSeconds * (5 + branch.energy * 17));

        if (branch.growth >= 1 && !branch.split && branch.depth < maxDepth && branches.length < maxBranches) {
            branch.split = true;
            const childCount = random() < branch.energy * 0.55 ? 2 : 1;
            const end = branchPoint(branch, 1);
            for (let child = 0; child < childCount && branches.length < maxBranches; child += 1) {
                sprout(branch, end);
            }
        }

        if (branch.age >= branch.lifetime) {
            branches.splice(i, 1);
        }
    }
}

function sprout(parent, origin) {
    const direction = parent.direction;
    const spread = random(0.35, 1.05) + parent.energy * 0.3;
    const azimuth = random(TWO_PI);
    const sideways = {
        x: Math.cos(azimuth),
        y: Math.sin(azimuth),
        z: random(-0.7, 0.7)
    };
    const worldOrigin = {
        x: parent.x + direction.x * parent.length,
        y: parent.y + direction.y * parent.length,
        z: parent.z + direction.z * parent.length
    };
    createBranch(worldOrigin, {
        x: direction.x * Math.cos(spread) + sideways.x * Math.sin(spread),
        y: direction.y * Math.cos(spread) + sideways.y * Math.sin(spread),
        z: direction.z * Math.cos(spread) + sideways.z * Math.sin(spread)
    }, parent.length * random(0.48, 0.82), parent.depth + 1, parent.energy * random(0.72, 1));
}

function branchPoint(branch, progress) {
    const direction = branch.direction;
    const end = {
        x: branch.x + direction.x * branch.length,
        y: branch.y + direction.y * branch.length,
        z: branch.z + direction.z * branch.length
    };
    const curve = (noise(branch.seed, visualTime * 1.4) - 0.5) * branch.curve;
    const inverse = 1 - progress;
    const bend = Math.sin(progress * PI) * curve;
    const jitter = (noise(branch.seed + progress * 8, visualTime * 5) - 0.5)
        * branch.energy * Math.min(width, height) * 0.035 * progress;
    const point = {
        x: inverse * branch.x + progress * end.x - direction.y * (bend + jitter),
        y: inverse * branch.y + progress * end.y + direction.x * (bend + jitter),
        z: inverse * branch.z + progress * end.z + Math.sin(progress * PI) * curve * 0.35
    };
    const perspective = 1 / (1 + point.z / (Math.min(width, height) * 2));
    return {
        x: width / 2 + point.x * perspective,
        y: height / 2 + point.y * perspective
    };
}

function drawCentralShape() {
    const radius = (100 + visualBass * 300) / 2;
    const pointCount = 72;
    const midWarp = visualMids * radius * 0.28;

    noFill();
    stroke(255, 225);
    strokeWeight(1);
    beginShape();
    for (let i = 0; i <= pointCount; i += 1) {
        const angle = TWO_PI * i / pointCount;
        const organic = noise(Math.cos(angle) * 1.7 + 3, Math.sin(angle) * 1.7 + 3, visualTime * 0.4) - 0.5;
        const ripple = Math.sin(angle * 3 + visualTime * 0.45) * midWarp * 0.55;
        const pointRadius = radius + organic * (radius * 0.24 + midWarp) + ripple;
        splineVertex(width / 2 + Math.cos(angle) * pointRadius, height / 2 + Math.sin(angle) * pointRadius);
    }
    endShape(CLOSE);
}

function drawStructure() {
    const context = drawingContext;
    noFill();
    strokeCap(ROUND);
    for (const branch of branches) {
        const remainingLife = Math.max(0, 1 - branch.age / branch.lifetime);
        const flicker = 0.68 + noise(branch.seed + 70, visualTime * (8 + visualHighs * 20)) * 0.32;
        const alpha = remainingLife * branch.energy * flicker * 255;
        const lineWidth = Math.max(0.5, (1.5 + branch.energy * 2.5) * (1 - branch.depth * 0.12));
        const segmentCount = Math.max(2, Math.ceil(branch.growth * 12));
        let previous = branchPoint(branch, 0);
        context.shadowColor = `rgba(180, 220, 255, ${remainingLife * branch.energy})`;
        context.shadowBlur = 3 + branch.energy * 14;
        stroke(220, 240, 255, alpha * 0.72);
        strokeWeight(lineWidth * 2.3);
        for (let segment = 1; segment <= segmentCount; segment += 1) {
            const progress = branch.growth * segment / segmentCount;
            const point = branchPoint(branch, progress);
            line(previous.x, previous.y, point.x, point.y);
            previous = point;
        }

        context.shadowBlur = 0;
        stroke(255, 255, 255, alpha);
        strokeWeight(lineWidth * 0.65);
        previous = branchPoint(branch, 0);
        for (let segment = 1; segment <= segmentCount; segment += 1) {
            const progress = branch.growth * segment / segmentCount;
            const point = branchPoint(branch, progress);
            line(previous.x, previous.y, point.x, point.y);
            previous = point;
        }

        if (branch.growth > 0.12 && remainingLife > 0.1) {
            const pulseProgress = (branch.age * (2 + branch.energy * 4) + branch.seed % 1) % branch.growth;
            const pulse = branchPoint(branch, pulseProgress);
            noStroke();
            fill(255, 255, 255, alpha);
            ellipse(pulse.x, pulse.y, 2 + branch.energy * 3);
        }
    }
    context.shadowBlur = 0;
}

function updateParticles(frameSeconds, highTransient) {
    if (highTransient > 0.0015 && visualHighs > 0.025 && sparkCooldown <= 0 && particles.length < 48) {
        const sparkCount = 1 + Math.floor(constrain(highTransient * 100, 0, 4));
        for (let i = 0; i < sparkCount && particles.length < 48; i += 1) {
            const angle = random(TWO_PI);
            const radius = Math.min(width, height) * 0.075 * (1 + visualBass * 1.2);
            particles.push({
                x: width / 2 + Math.cos(angle) * radius,
                y: height / 2 + Math.sin(angle) * radius,
                vx: Math.cos(angle) * random(18, 65),
                vy: Math.sin(angle) * random(18, 65),
                life: random(0.16, 0.38),
                size: random(1, 2.5)
            });
        }
        sparkCooldown = 0.055;
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.x += particle.vx * frameSeconds;
        particle.y += particle.vy * frameSeconds;
        particle.life -= frameSeconds;
        if (particle.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    drawingContext.shadowColor = 'rgba(190, 225, 255, 0.9)';
    drawingContext.shadowBlur = 10;
    noStroke();
    for (const particle of particles) {
        fill(255, constrain(particle.life / 0.38, 0, 1) * 230);
        ellipse(particle.x, particle.y, particle.size, particle.size);
    }
    drawingContext.shadowBlur = 0;
}

function keyPressed() {
    if (key === '[' || key === ']') {
        bassSensitivity = constrain(bassSensitivity + (key === ']' ? 0.5 : -0.5), 0.5, 10);
        statusText.textContent = `Bass sensitivity: ${bassSensitivity.toFixed(1)} (adjust with [ and ])`;
    }
}

function windowResized() {
    if (canvasContainer) {
        const widthScale = canvasContainer.clientWidth / previousWidth;
        const heightScale = canvasContainer.clientHeight / previousHeight;
        const lengthScale = Math.min(widthScale, heightScale);
        for (const branch of branches) {
            branch.x *= widthScale;
            branch.y *= heightScale;
            branch.z *= lengthScale;
            branch.length *= lengthScale;
            branch.curve *= lengthScale;
        }
        for (const particle of particles) {
            particle.x *= widthScale;
            particle.y *= heightScale;
        }
        resizeCanvas(canvasContainer.clientWidth, canvasContainer.clientHeight);
        previousWidth = width;
        previousHeight = height;
    }
}

async function handleAudioSelection(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    if (audioFile) {
        const previousFile = audioFile;
        audioFile = null;
        previousFile.stop();
    }

    fileInput.disabled = true;
    playButton.disabled = true;
    playButton.textContent = 'Loading...';
    statusText.textContent = `Loading ${file.name}...`;

    let audioUrl;
    try {
        audioUrl = URL.createObjectURL(file);
        const loadedFile = await loadSound(audioUrl);
        audioFile = loadedFile;
        fft.setInput(audioFile);
        resetStructure();
        audioFile.onended(() => {
            if (audioFile === loadedFile) {
                updatePlaybackControls(false);
            }
        });
        playButton.disabled = false;
        playButton.textContent = 'Play';
        statusText.textContent = `${file.name} is ready.`;
    } catch (error) {
        playButton.disabled = true;
        playButton.textContent = 'Play';
        statusText.textContent = `Could not load ${file.name}. Please choose a supported audio file.`;
        console.error('Audio file could not be loaded:', error);
    } finally {
        fileInput.disabled = false;
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }
    }
}

async function handlePlayback() {
    if (!audioFile) {
        return;
    }

    try {
        await userStartAudio();
        if (audioFile.isPlaying()) {
            audioFile.pause();
            updatePlaybackControls(false);
        } else {
            audioFile.play();
            updatePlaybackControls(true);
        }
    } catch (error) {
        statusText.textContent = 'Audio could not be started. Please try again.';
        console.error('Audio playback could not be started:', error);
    }
}

function updatePlaybackControls(isPlaying) {
    playButton.textContent = isPlaying ? 'Pause' : 'Play';
    statusText.textContent = isPlaying ? 'Growing with your music...' : 'Playback paused.';
}
