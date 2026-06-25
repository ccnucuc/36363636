require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SoundCloudPlugin } = require('@distube/soundcloud');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const distube = new DisTube(client, {
    plugins: [
        new YtDlpPlugin({
            update: true,
            ytdlOptions: {
                cookies: '/opt/render/project/src/cookies.txt'
            }
        }),
        new SoundCloudPlugin(),
    ],
    emitNewSongOnly: true,
    joinNewVoiceChannel: true,
    nsfw: false,
});

function formatDuration(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
        : `${m}:${String(sec).padStart(2,'0')}`;
}

// DisTube events
distube.on('playSong', (queue, song) => {
    const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle('🎵 Đang phát')
        .setDescription(`**[${song.name}](${song.url})**`)
        .addFields(
            { name: 'Thời lượng', value: song.formattedDuration || 'Live', inline: true },
            { name: 'Nguồn', value: song.source || 'YouTube', inline: true },
            { name: 'Yêu cầu bởi', value: song.user?.tag || 'N/A', inline: true }
        )
        .setThumbnail(song.thumbnail || null);
    queue.textChannel?.send({ embeds: [embed] });
});

distube.on('addSong', (queue, song) => {
    queue.textChannel?.send(`✅ Đã thêm vào hàng đợi: **${song.name}**`);
});

distube.on('addList', (queue, playlist) => {
    queue.textChannel?.send(`✅ Đã thêm playlist **${playlist.name}** (${playlist.songs.length} bài)`);
});

distube.on('error', (channel, error) => {
    console.error('DisTube error:', error.message);
    channel?.send(`❌ Có lỗi xảy ra khi phát nhạc: ${error.message.slice(0, 100)}`);
});

distube.on('finish', queue => {
    queue.textChannel?.send('👋 Hết nhạc trong hàng đợi!');
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
            await message.reply('🔍 Đang tìm kiếm...');
            await distube.play(voiceChannel, query, {
                member: message.member,
                textChannel: message.channel,
                message
            });
        }

        // SOUNDCLOUD
        else if (command === 'sc') {
            const query = args.join(' ');
            if (!query) return message.reply('❌ Nhập tên bài hát SoundCloud!');
            if (!voiceChannel) return message.reply('❌ Bạn cần vào kênh voice trước!');
            await message.reply('🔍 Đang tìm kiếm trên SoundCloud...');
            await distube.play(voiceChannel, `scsearch:${query}`, {
                member: message.member,
                textChannel: message.channel,
                message
            });
        }

        // PAUSE
        else if (command === 'pause') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Không có nhạc đang phát.');
            queue.pause();
            message.reply('⏸ Đã tạm dừng.');
        }

        // RESUME
        else if (command === 'resume' || command === 'r') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Không có nhạc.');
            queue.resume();
            message.reply('▶️ Tiếp tục phát.');
        }

        // SKIP
        else if (command === 'skip' || command === 's') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Không có nhạc đang phát.');
            await queue.skip();
            message.reply('⏭ Đã bỏ qua.');
        }

        // STOP
        else if (command === 'stop') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Bot không ở trong kênh voice.');
            queue.stop();
            message.reply('⏹ Đã dừng và rời kênh voice.');
        }

        // QUEUE
        else if (command === 'queue' || command === 'q') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Không có nhạc trong hàng đợi.');
            const songs = queue.songs.slice(1, 11);
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle('📋 Hàng đợi nhạc')
                .setDescription(
                    `**Đang phát:** ${queue.songs[0].name}\n\n` +
                    (songs.length ? songs.map((s, i) => `**${i+1}.** ${s.name}`).join('\n') : 'Không có bài tiếp theo.')
                )
                .setFooter({ text: `Tổng: ${queue.songs.length} bài` });
            message.reply({ embeds: [embed] });
        }

        // NOW PLAYING
        else if (command === 'np' || command === 'nowplaying') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Không có nhạc đang phát.');
            const song = queue.songs[0];
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle('🎵 Đang phát')
                .setDescription(`**[${song.name}](${song.url})**`)
                .addFields(
                    { name: 'Thời lượng', value: song.formattedDuration || 'Live', inline: true },
                    { name: 'Tiến trình', value: `${formatDuration(Math.floor(queue.currentTime))} / ${song.formattedDuration}`, inline: true },
                    { name: 'Nguồn', value: song.source || 'YouTube', inline: true }
                )
                .setThumbnail(song.thumbnail || null);
            message.reply({ embeds: [embed] });
        }

        // VOLUME
        else if (command === 'volume' || command === 'vol') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Không có nhạc đang phát.');
            const vol = parseInt(args[0]);
            if (isNaN(vol) || vol < 0 || vol > 200) return message.reply('❌ Âm lượng hợp lệ: 0–200.');
            queue.setVolume(vol);
            message.reply(`🔊 Âm lượng: **${vol}%**`);
        }

        // LOOP
        else if (command === 'loop') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Không có nhạc.');
            const mode = (queue.repeatMode + 1) % 3;
            queue.setRepeatMode(mode);
            const labels = ['❌ Tắt', '🔂 Lặp bài', '🔁 Lặp queue'];
            message.reply(`Loop: **${labels[mode]}**`);
        }

        // SHUFFLE
        else if (command === 'shuffle') {
            const queue = distube.getQueue(message.guild);
            if (!queue) return message.reply('❌ Không có nhạc trong hàng đợi.');
            await queue.shuffle();
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

client.once('ready', () => {
    console.log(`✅ Bot đã online: ${client.user.tag}`);
    client.user.setActivity(`${PREFIX}help`, { type: ActivityType.Listening });
});

client.login(process.env.DISCORD_TOKEN);
