import { supabase } from './supabase-client.js';

export const dbService = {
    /**
     * Tạo một bộ từ vựng mới cho người dùng hiện tại.
     * @param {string} name - Tên của bộ từ vựng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    createVocabularySet: async (name, userId) => {
        if (!name || !userId) {
            return { data: null, error: new Error('Set name and user ID are required.') };
        }

        const { data, error } = await supabase
            .from('vocabulary_sets')
            .insert([{ name, user_id: userId }])
            .select();

        return { data, error };
    },

    /**
     * Lấy tất cả các bộ từ vựng của một người dùng.
     * @param {string} userId - ID của người dùng.
     * @param {object} [options={}] - Tùy chọn sắp xếp.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getVocabularySets: async (userId, options = {}) => {
        if (!userId) {
            return { data: null, error: new Error('User ID is required.') };
        }
        const { sortBy = 'created_at', ascending = false } = options;

        const { data, error } = await supabase
            .from('vocabulary_sets')
            .select('*')
            .eq('user_id', userId)
            .order(sortBy, { ascending });

        return { data, error };
    },

    /**
     * Tìm kiếm các bộ từ vựng của người dùng theo tên.
     * @param {string} userId - ID của người dùng.
     * @param {string} searchTerm - Từ khóa tìm kiếm.
     * @param {object} [options={}] - Tùy chọn sắp xếp.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    searchVocabularySets: async (userId, searchTerm, options = {}) => {
        if (!userId) {
            return { data: null, error: new Error('User ID is required.') };
        }
        const { sortBy = 'created_at', ascending = false } = options;

        const { data, error } = await supabase
            .from('vocabulary_sets')
            .select('*')
            .eq('user_id', userId)
            .ilike('name', `%${searchTerm}%`) // ilike cho tìm kiếm không phân biệt hoa thường
            .order(sortBy, { ascending });

        return { data, error };
    },

    /**
     * Cập nhật tên của một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} newName - Tên mới.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    updateVocabularySetName: async (setId, newName) => {
        const { data, error } = await supabase
            .from('vocabulary_sets')
            .update({ name: newName })
            .eq('id', setId)
            .select();

        return { data, error };
    },
    /**
     * Xóa một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng cần xóa.
     * @returns {Promise<{ error: Error | null }>}
     */
    deleteVocabularySet: async (setId) => {
        const { error } = await supabase
            .from('vocabulary_sets')
            .delete()
            .eq('id', setId);
        return { error };
    },

    /**
     * Lấy thông tin chi tiết của một bộ từ vựng bằng ID.
     * @param {string} setId - ID của bộ từ vựng.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    getVocabularySetById: async (setId) => {
        const { data, error } = await supabase
            .from('vocabulary_sets')
            .select('*')
            .eq('id', setId)
            .single(); // .single() để trả về một object thay vì một array

        return { data, error };
    },

    /**
     * Import một danh sách từ vào một bộ từ vựng.
     * Sử dụng RPC để gọi một function trong database.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {Array<object>} words - Mảng các đối tượng từ.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    importWordsToSet: async (setId, words) => {
        const { data, error } = await supabase.rpc('import_words_to_set', {
            p_set_id: setId,
            p_words_data: words
        });
        return { data, error };
    },

    /**
     * Lấy tất cả các từ trong một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getWordsInSet: async (setId) => {
        const { data, error } = await supabase
            .from('set_words')
            .select(`
                word_senses (
                    id,
                    word_type,
                    meaning,
                    description,
                    example,
                    words (
                        word,
                        ipa
                    )
                )
            `)
            .eq('set_id', setId);
        return { data, error };
    },

    /**
     * Xóa một từ (word sense) khỏi một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} wordSenseId - ID của word_sense cần xóa.
     * @returns {Promise<{ error: Error | null }>}
     */
    removeWordFromSet: async (setId, wordSenseId) => {
        const { error } = await supabase
            .from('set_words')
            .delete()
            .eq('set_id', setId)
            .eq('word_sense_id', wordSenseId);
        return { error };
    },

    /**
     * Cập nhật hoặc chèn tiến trình học của người dùng cho một loạt các từ.
     * @param {Array<object>} progressUpdates - Mảng các đối tượng tiến trình cần cập nhật.
     * @returns {Promise<{ error: Error | null }>}
     */
    updateUserProgress: async (progressUpdates) => {
        const { error } = await supabase
            .from('user_progress')
            .upsert(progressUpdates);
        return { error };
    },

    /**
     * Lấy danh sách các từ cần ôn tập cho người dùng.
     * @param {string} userId - ID của người dùng.
     * @param {number} [limit=50] - Số lượng từ tối đa cần lấy.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getDueReviewWords: async (userId, limit = 50) => {
        const { data, error } = await supabase
            .from('user_progress')
            .select(`
                word_senses (
                    id,
                    word_type,
                    meaning,
                    description,
                    example,
                    words (
                        word,
                        ipa
                    )
                )
            `)
            .eq('user_id', userId)
            .lte('review_due_at', new Date().toISOString()) // Lấy các từ có ngày ôn tập trong quá khứ hoặc hiện tại
            .order('review_due_at', { ascending: true }) // Ưu tiên từ quá hạn lâu nhất
            .limit(limit);
        return { data, error };
    },

    /**
     * Lấy tiến trình học hiện tại cho một danh sách các từ.
     * @param {string} userId - ID của người dùng.
     * @param {string[]} wordSenseIds - Mảng các ID của word_sense.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getCurrentProgressForWords: async (userId, wordSenseIds) => {
        const { data, error } = await supabase
            .from('user_progress')
            .select('word_sense_id, mastery_level')
            .in('word_sense_id', wordSenseIds)
            .eq('user_id', userId);
        return { data, error };
    },
    /**
     * Lấy số lượng từ cần ôn tập cho người dùng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ count: number, error: Error | null }>}
     */
    getDueReviewWordsCount: async (userId) => {
        const { count, error } = await supabase
            .from('user_progress')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .lte('review_due_at', new Date().toISOString());
        
        return { count, error };
    },

    /**
     * Lấy thông tin hồ sơ public của người dùng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    getProfile: async (userId) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        return { data, error };
    },

    /**
     * Cập nhật hồ sơ public của người dùng.
     * @param {string} userId - ID của người dùng.
     * @param {object} updates - Các trường cần cập nhật (e.g., { username, avatar_url }).
     * @returns {Promise<{ error: Error | null }>}
     */
    updateProfile: async (userId, updates) => {
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);
        return { error };
    },

    /**
     * Tải lên một file ảnh đại diện.
     * @param {File} file - File ảnh.
     * @returns {Promise<{ data: { path: string }, error: Error | null }>}
     */
    uploadAvatar: async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { data, error } = await supabase.storage
            .from('avatars') // 'avatars' là tên bucket của bạn trong Supabase Storage
            .upload(filePath, file);

        return { data, error };
    },

    /**
     * Cập nhật chi tiết của một từ (word và word_sense).
     * @param {string} wordId - ID của từ trong bảng `words`.
     * @param {string} senseId - ID của nghĩa trong bảng `word_senses`.
     * @param {object} updates - Đối tượng chứa các thông tin cập nhật.
     * @returns {Promise<{ error: Error | null }>}
     */
    updateWordDetails: async (wordId, senseId, updates) => {
        const wordUpdates = {
            word: updates.word,
            ipa: updates.ipa,
            cefr_level: updates.cefr,
        };
        const senseUpdates = {
            word_type: updates.word_type,
            meaning: updates.meaning,
            description: updates.description,
            example: updates.example,
        };

        // Cập nhật bảng `words`
        const { error: wordError } = await supabase.from('words').update(wordUpdates).eq('id', wordId);
        if (wordError) return { error: wordError };

        // Cập nhật bảng `word_senses`
        const { error: senseError } = await supabase.from('word_senses').update(senseUpdates).eq('id', senseId);
        return { error: senseError };
    },

    /**
     * Lấy thống kê cấp độ thành thạo của người dùng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getMasteryLevelStats: async (userId) => {
        const { data, error } = await supabase
            .rpc('get_mastery_stats', { p_user_id: userId });
        return { data, error };
    },

    /**
     * Lấy các từ gây nhiễu cho game mode trắc nghiệm.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} excludeSenseId - ID của nghĩa cần loại trừ (đáp án đúng).
     * @param {number} limit - Số lượng từ cần lấy.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getDistractors: async (setId, excludeSenseId, limit) => {
        const { data, error } = await supabase
            .rpc('get_distractors', { p_set_id: setId, p_exclude_sense_id: excludeSenseId, p_limit: limit });
        return { data, error };
    },

    /**
     * Lưu hoặc cập nhật thông tin đăng ký push notification.
     * @param {object} subscription - Đối tượng PushSubscription.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ error: Error | null }>}
     */
    savePushSubscription: async (subscription, userId) => {
        const { error } = await supabase
            .from('push_subscriptions') // Bảng này cần được tạo
            .upsert({ endpoint: subscription.endpoint, subscription_details: subscription, user_id: userId }, { onConflict: 'endpoint' });
        return { error };
    },

    /**
     * Lấy thống kê chi tiết cho một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getSetStatistics: async (setId, userId) => {
        const { data, error } = await supabase
            .rpc('get_set_statistics', { p_set_id: setId, p_user_id: userId });
        return { data, error };
    },

    /**
     * Ghi lại hoạt động của người dùng trong ngày hiện tại.
     * @returns {Promise<{ error: Error | null }>}
     */
    logDailyActivity: async () => {
        const { error } = await supabase.rpc('log_daily_activity');
        return { error };
    },

    /**
     * Lấy chuỗi ngày học hiện tại của người dùng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: number, error: Error | null }>}
     */
    getLearningStreak: async (userId) => {
        const { data, error } = await supabase
            .rpc('get_learning_streak', { p_user_id: userId });
        return { data, error };
    },

    /**
     * Ghi lại số lượng từ mới học trong ngày.
     * @param {number} wordCount - Số lượng từ mới học.
     * @returns {Promise<{ error: Error | null }>}
     */
    logLearningActivity: async (wordCount) => {
        if (wordCount <= 0) return { error: null };
        const { error } = await supabase.rpc('log_learning_activity', { p_words_learned: wordCount });
        return { error };
    },

    /**
     * Lấy tiến độ mục tiêu trong ngày của người dùng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: {words_learned: number, daily_goal: number}, error: Error | null }>}
     */
    getDailyGoalProgress: async (userId) => {
        const { data, error } = await supabase
            .rpc('get_daily_goal_progress', { p_user_id: userId })
            .single(); // Lấy một bản ghi duy nhất

        return { data, error };
    },

    /**
     * Tìm kiếm nâng cao cho các bộ từ vựng.
     * @param {string} userId - ID của người dùng.
     * @param {object} filters - Đối tượng chứa các bộ lọc.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    advancedSearchVocabularySets: async (userId, filters) => {
        const { data, error } = await supabase.rpc('advanced_search_sets', {
            p_user_id: userId,
            p_name_query: filters.nameQuery || null,
            p_contains_word: filters.containsWord || null,
            p_created_after: filters.createdAfter || null,
            p_created_before: filters.createdBefore || null,
            p_sort_by: filters.sortBy || 'created_at',
            p_sort_order_asc: filters.sortOrderAsc || false
        });

        return { data, error };
    },

    /**
     * Cập nhật riêng bảng `word_senses` (loại từ, nghĩa, ví dụ, mô tả).
     * Bảng này có chính sách RLS cho phép UPDATE nên thao tác này luôn khả thi.
     * @param {string} senseId - ID của word_sense cần cập nhật.
     * @param {object} updates - Các trường cần cập nhật.
     * @returns {Promise<{ error: Error | null }>}
     */
    updateWordSenseDetails: async (senseId, updates) => {
        const senseUpdates = {
            word_type: updates.word_type,
            meaning: updates.meaning,
            description: updates.description,
            example: updates.example,
        };
        const { error } = await supabase
            .from('word_senses')
            .update(senseUpdates)
            .eq('id', senseId);
        return { error };
    },

    /**
     * Lấy danh sách từ trong một bộ từ vựng kèm theo tiến trình học (mastery level)
     * của người dùng hiện tại.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} userId - ID của người dùng để lấy tiến trình học.
     * @returns {Promise<{ data: Array, error: Error | null }>}
     */
    getWordsInSetWithProgress: async (setId, userId) => {
        // Gọi RPC mới để lấy dữ liệu đã được join sẵn từ DB.
        // Hiệu quả hơn nhiều so với việc query 2 bảng và join ở client.
        const { data, error } = await supabase.rpc('get_words_in_set_with_progress', {
            p_set_id: setId,
            p_user_id: userId,
        });

        if (error) {
            // Nếu RPC không tồn tại (ví dụ: migration chưa chạy), có thể fallback về logic cũ
            // nhưng hiện tại chỉ báo lỗi để dễ debug.
            console.error('Error calling get_words_in_set_with_progress RPC:', error);
            return { data: null, error };
        }

        // RPC trả về một danh sách các object phẳng, cần điều chỉnh lại cấu trúc
        // một chút để tương thích với cách UI đang dùng (nếu cần).
        // Dựa trên cấu trúc RPC, các trường đã khớp với UI.
        // Chỉ cần đổi tên một vài trường để khớp với logic cũ.
        const merged = (data || []).map(item => {
            return {
                ...item,
                reference: item.word, // UI cũ có thể dùng `reference`
                created_at: null,
                set_word_sense_id: item.id,
            };
        });

        return { data: merged, error: null };
    },

    /**
     * Cập nhật thông tin của một bộ từ vựng (tên, mô tả).
     * @param {string} setId - ID của bộ từ vựng.
     * @param {object} updates - Đối tượng chứa các trường cần cập nhật (name, description).
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    updateVocabularySetMeta: async (setId, updates) => {
        const { data, error } = await supabase
            .from('vocabulary_sets')
            .update(updates)
            .eq('id', setId)
            .select();
        return { data, error };
    },

    /**
     * Cập nhật trạng thái tiến trình học của một từ (mastery level).
     * Có thể dùng để đặt lại trạng thái "chưa học".
     * @param {string} wordSenseId - ID của word_sense.
     * @param {string} userId - ID của người dùng.
     * @param {object} update - Đối tượng cập nhật (vd: { mastery_level: 0, review_due_at: now() }).
     * @returns {Promise<{ error: Error | null }>}
     */
    upsertWordProgress: async (wordSenseId, userId, update = {}) => {
        const now = new Date().toISOString();
        const payload = {
            user_id: userId,
            word_sense_id: wordSenseId,
            mastery_level: 0,
            review_due_at: now,
            ...update
        };
        const { error } = await supabase
            .from('user_progress')
            .upsert(payload);
        return { error };
    },

    /**
     * Xóa một từ khỏi bộ từ vựng.
     * Ghi chú: Bảng `word_senses` chỉ cho phép SELECT/INSERT qua RLS (dữ liệu dùng chung),
     * nên từ chỉ được gỡ khỏi quan hệ `set_words` (giữ nguyên dữ liệu gốc của từ).
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} wordSenseId - ID của word_sense cần gỡ.
     * @returns {Promise<{ error: Error | null }>}
     */
    deleteWordComplete: async (setId, wordSenseId) => {
        // Xóa quan hệ trong set_words (đã có RLS cho phép thao tác trong set của user)
        const { error } = await supabase
            .from('set_words')
            .delete()
            .eq('set_id', setId)
            .eq('word_sense_id', wordSenseId);
        return { error };
    }
};
