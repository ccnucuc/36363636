require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { Poru } = require('poru');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const nodes = [
    {
        name: 'Node1',
        host: process.env.LAVALINK_HOST || 'node2.zencheap.net',
        port: parseInt(process.env.LAVALINK_PORT) || 30087,
        password: process.env.LAVALINK_PASS || 'LeThaiAn',
        secure: false,
    }
];

const poru = new Poru(client, nodes, {
    library: 'discord.js',
    defaultPlatform: 'ytmsearch',
    reconnectTimeout: 5000,
    reconnectTries: 5,
});

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
        : `${m}:${String(sec).padStart(2,'0')}`;
}

// Poru events
poru.on('nodeConnect', node => {
    console.log(`✅ Lavalink node "${node.name}" đã kết nối!`);
});

poru.on('nodeError', (node, error) => {
    console.error(`❌ Lỗi node "${node.name}":`, error.message);
});

poru.on('trackStart', (player, track) => {
    const channel = client.channels.cache.get(player.textChannel);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle('🎵 Đang phát')
        .setDescription(`**[${track.info.title}](${track.info.uri})**`)
        .addFields(
            { name: 'Thời lượng', value: track.info.isStream ? 'Live' : formatDuration(track.info.length), inline: true },
            { name: 'Tác giả', value: track.info.author || 'N/A', inline: true },
            { name: 'Yêu cầu bởi', value: track.info.requester?.tag || 'N/A', inline: true }
        )
        .setThumbnail(track.info.artworkUrl || null);
    channel.send({ embeds: [embed] });
});

poru.on('trackEnd', (player) => {
    if (player.queue.length === 0) {
        const channel = client.channels.cache.get(player.textChannel);
        channel?.send('👋 Hết nhạc trong hàng đợi!');
    }
});

poru.on('trackError', (player, track, error) => {
    const channel = client.channels.cache.get(player.textChannel);
    console.error('Track error:', error);
    channel?.send(`❌ Lỗi khi phát: **${track.info.title}**`);
    player.stop();
});

poru.on('queueEnd', (player) => {
    const channel = client.channels.cache.get(player.textChannel);
    channel?.send('👋 Hết nhạc trong hàng đợi!');
    player.destroy();
});

const PREFIX = process.env.PREFIX || '>';

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const voiceChannel = message.member?.voice?.channel;

    try {
        // PLAY
        if (command === 'play' || command === 'p') {
            const query = args.join(' ');
            if (!query) return message.reply('❌ Nhập tên bài hát hoặc URL!');
            if (!voiceChannel) return message.reply('❌ Bạn cần vào kênh voice trước!');

            const player = poru.createConnection({
                guildId: message.guild.id,
                voiceChannel: voiceChannel.id,
                textChannel: message.channel.id,
                deaf: true,
            });

            await message.reply('🔍 Đang tìm kiếm...');

            const isUrl = /^https?:\/\//.test(query);
            const searchQuery = isUrl ? query : `ytmsearch:${query}`;
            const result = await poru.resolve({ query: searchQuery, requester: message.author });

            if (!result || result.loadType === 'NO_MATCHES' || result.loadType === 'LOAD_FAILED') {
                return message.reply('❌ Không tìm thấy bài hát!');
            }

            if (result.loadType === 'PLAYLIST_LOADED') {
                for (const track of result.tracks) {
                    track.info.requester = message.author;
                    player.queue.add(track);
                }
                message.channel.send(`✅ Đã thêm playlist **${result.playlistInfo.name}** (${result.tracks.length} bài)`);
            } else {
                const track = result.tracks[0];
                track.info.requester = message.author;
                player.queue.add(track);
                if (player.isPlaying) {
                    message.channel.send(`✅ Đã thêm vào hàng đợi: **${track.info.title}**`);
                }
            }

            if (!player.isPlaying && !player.isPaused) player.play();
        }

        // SOUNDCLOUD
        else if (command === 'sc') {
            const query = args.join(' ');
            if (!query) return message.reply('❌ Nhập tên bài hát SoundCloud!');
            if (!voiceChannel) return message.reply('❌ Bạn cần vào kênh voice trước!');

            const player = poru.createConnection({
                guildId: message.guild.id,
                voiceChannel: voiceChannel.id,
                textChannel: message.channel.id,
                deaf: true,
            });

            await message.reply('🔍 Đang tìm kiếm trên SoundCloud...');
            const result = await poru.resolve({ query: `scsearch:${query}`, requester: message.author });

            if (!result || result.loadType === 'NO_MATCHES' || result.loadType === 'LOAD_FAILED') {
                return message.reply('❌ Không tìm thấy bài hát trên SoundCloud!');
            }

            const track = result.tracks[0];
            track.info.requester = message.author;
            player.queue.add(track);
            if (player.isPlaying) {
                message.channel.send(`✅ Đã thêm vào hàng đợi: **${track.info.title}**`);
            }
            if (!player.isPlaying && !player.isPaused) player.play();
        }

        // PAUSE
        else if (command === 'pause') {
            const player = poru.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc đang phát.');
            if (player.isPaused) return message.reply('⏸ Nhạc đã đang tạm dừng rồi.');
            player.pause(true);
            message.reply('⏸ Đã tạm dừng.');
        }

        // RESUME
        else if (command === 'resume' || command === 'r') {
            const player = poru.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc.');
            if (!player.isPaused) return message.reply('▶️ Nhạc đang phát rồi.');
            player.pause(false);
            message.reply('▶️ Tiếp tục phát.');
        }

        // SKIP
        else if (command === 'skip' || command === 's') {
            const player = poru.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc đang phát.');
            player.stop();
            message.reply('⏭ Đã bỏ qua.');
        }

        // STOP
        else if (command === 'stop') {
            const player = poru.players.get(message.guild.id);
            if (!player) return message.reply('❌ Bot không ở trong kênh voice.');
            player.destroy();
            message.reply('⏹ Đã dừng và rời kênh voice.');
        }

        // QUEUE
        else if (command === 'queue' || command === 'q') {
            const player = poru.players.get(message.guild.id);
            if (!player || !player.currentTrack) return message.reply('❌ Không có nhạc trong hàng đợi.');
            const songs = player.queue.slice(0, 10);
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle('📋 Hàng đợi nhạc')
                .setDescription(
                    `**Đang phát:** ${player.currentTrack.info.title}\n\n` +
                    (songs.length ? songs.map((s, i) => `**${i+1}.** ${s.info.title}`).join('\n') : 'Không có bài tiếp theo.')
                )
                .setFooter({ text: `Tổng: ${player.queue.length + 1} bài` });
            message.reply({ embeds: [embed] });
        }

        // NOW PLAYING
        else if (command === 'np' || command === 'nowplaying') {
            const player = poru.players.get(message.guild.id);
            if (!player || !player.currentTrack) return message.reply('❌ Không có nhạc đang phát.');
            const track = player.currentTrack;
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle('🎵 Đang phát')
                .setDescription(`**[${track.info.title}](${track.info.uri})**`)
                .addFields(
                    { name: 'Thời lượng', value: track.info.isStream ? 'Live' : formatDuration(track.info.length), inline: true },
                    { name: 'Tiến trình', value: `${formatDuration(player.position)} / ${formatDuration(track.info.length)}`, inline: true },
                    { name: 'Tác giả', value: track.info.author || 'N/A', inline: true }
                )
                .setThumbnail(track.info.artworkUrl || null);
            message.reply({ embeds: [embed] });
        }

        // VOLUME
        else if (command === 'volume' || command === 'vol') {
            const player = poru.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc đang phát.');
            const vol = parseInt(args[0]);
            if (isNaN(vol) || vol < 0 || vol > 200) return message.reply('❌ Âm lượng hợp lệ: 0–200.');
            player.setVolume(vol);
            message.reply(`🔊 Âm lượng: **${vol}%**`);
        }

        // LOOP
        else if (command === 'loop') {
            const player = poru.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc.');
            const modes = ['NONE', 'TRACK', 'QUEUE'];
            const next = modes[(modes.indexOf(player.loop) + 1) % 3];
            player.setLoop(next);
            const labels = { NONE: '❌ Tắt', TRACK: '🔂 Lặp bài', QUEUE: '🔁 Lặp queue' };
            message.reply(`Loop: **${labels[next]}**`);
        }

        // SHUFFLE
        else if (command === 'shuffle') {
            const player = poru.players.get(message.guild.id);
            if (!player || player.queue.length === 0) return message.reply('❌ Không có nhạc trong hàng đợi.');
            player.queue.shuffle();
            message.reply('🔀 Đã xáo trộn hàng đợi!');
        }

        // HELP
        else if (command === 'help') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎶 Inferno Music - Lệnh')
                .setDescription(`Prefix: \`${PREFIX}\``)
                .addFields(
                    { name: `\`${PREFIX}play <tên/url>\``, value: 'Phát nhạc YouTube hoặc URL' },
                    { name: `\`${PREFIX}sc <tên>\``, value: 'Tìm và phát nhạc SoundCloud' },
                    { name: `\`${PREFIX}pause\` / \`${PREFIX}resume\``, value: 'Tạm dừng / Tiếp tục' },
                    { name: `\`${PREFIX}skip\``, value: 'Bỏ qua bài hiện tại' },
                    { name: `\`${PREFIX}stop\``, value: 'Dừng và rời kênh voice' },
                    { name: `\`${PREFIX}queue\``, value: 'Xem hàng đợi' },
                    { name: `\`${PREFIX}np\``, value: 'Xem bài đang phát' },
                    { name: `\`${PREFIX}volume <0-200>\``, value: 'Điều chỉnh âm lượng' },
                    { name: `\`${PREFIX}loop\``, value: 'Lặp bài / queue / tắt' },
                    { name: `\`${PREFIX}shuffle\``, value: 'Xáo trộn hàng đợi' },
                );
            message.reply({ embeds: [embed] });
        }

    } catch (e) {
        console.error(e);
        message.reply(`❌ Có lỗi: ${e.message?.slice(0, 100) || 'Không xác định'}`);
    }
});

// Cần thiết để Poru hoạt động với Discord.js
client.on('raw', (data) => poru.updateVoiceState(data));

client.once('ready', () => {
    console.log(`✅ Bot đã online: ${client.user.tag}`);
    client.user.setActivity(`${PREFIX}help`, { type: ActivityType.Listening });
    poru.init(client);
});

client.login(process.env.DISCORD_TOKEN);
