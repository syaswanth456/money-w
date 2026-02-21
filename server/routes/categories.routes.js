const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../config/supabaseClient");
const { emitCategoriesUpdate, emitDashboardUpdate } = require("../sockets/realtime.socket");
const { createInAppNotification } = require("../services/inapp-notifications");

function emptyCategories() {
  return { expense: [], income: [] };
}

function requireUserId(req) {
  return req.session?.user?.id || null;
}

// GET all
router.get("/", async (req, res) => {
  try {
    const userId = requireUserId(req);
    const type = String(req.query?.type || "").toLowerCase();
    if (!userId) {
      if (type) return res.json({ categories: [] });
      return res.json({ categories: emptyCategories() });
    }

    const query = supabaseAdmin
      .from("categories")
      .select("id, name, icon, type")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const allowedTypes = new Set(["expense", "income", "bill"]);
    if (allowedTypes.has(type)) {
      query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Categories fetch error:", error);
      if (type) return res.json({ categories: [] });
      return res.json({ categories: emptyCategories() });
    }

    const normalized = (data || []).map((row) => ({
      ...row,
      total_transactions: 0
    }));

    if (allowedTypes.has(type)) {
      return res.json({ categories: normalized });
    }

    const grouped = emptyCategories();
    for (const row of normalized) {
      if (row.type === "income") grouped.income.push(row);
      else grouped.expense.push(row);
    }

    return res.json({ categories: grouped });
  } catch (err) {
    console.error("Categories route crash:", err);
    return res.json({ categories: emptyCategories() });
  }
});

// GET by type
router.get("/type/:type", async (req, res) => {
  try {
    const userId = requireUserId(req);
    const type = String(req.params.type || "").toLowerCase();

    if (!userId || (type !== "expense" && type !== "income" && type !== "bill")) {
      return res.json({ categories: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("id, name, icon, type")
      .eq("user_id", userId)
      .eq("type", type)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Categories by type error:", error);
      return res.json({ categories: [] });
    }

    return res.json({
      categories: (data || []).map((row) => ({ ...row, total_transactions: 0 }))
    });
  } catch (err) {
    console.error("Categories by type crash:", err);
    return res.json({ categories: [] });
  }
});

router.post("/", async (req, res) => {
  try {
    const userId = requireUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, icon, type } = req.body || {};
    const normalizedType = String(type || "").toLowerCase();

    if (!name || (normalizedType !== "expense" && normalizedType !== "income" && normalizedType !== "bill")) {
      return res.status(400).json({ error: "Invalid category payload" });
    }

    const payload = {
      user_id: userId,
      name: String(name).trim(),
      icon: String(icon || "tag").trim(),
      type: normalizedType
    };

    const { data, error } = await supabaseAdmin
      .from("categories")
      .insert([payload])
      .select("id, name, icon, type")
      .single();

    if (error) {
      console.error("Category create error:", error);
      return res.status(500).json({ error: "Failed to create category" });
    }

    await createInAppNotification(userId, {
      type: "success",
      title: "Category Created",
      message: `${payload.name} category was created.`,
      icon: payload.icon || "tag",
      meta: { category_id: data?.id || null }
    });

    emitCategoriesUpdate(userId);
    emitDashboardUpdate(userId);

    return res.status(201).json({
      category: data ? { ...data, total_transactions: 0 } : null
    });
  } catch (err) {
    console.error("Category create crash:", err);
    return res.status(500).json({ error: "Failed to create category" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const userId = requireUserId(req);
    const categoryId = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, icon, type } = req.body || {};
    const updates = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof icon === "string" && icon.trim()) updates.icon = icon.trim();
    if (typeof type === "string" && ["expense", "income", "bill"].includes(type.toLowerCase())) {
      updates.type = type.toLowerCase();
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from("categories")
      .update(updates)
      .eq("id", categoryId)
      .eq("user_id", userId)
      .select("id, name, icon, type")
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Category not found" });
    }

    await createInAppNotification(userId, {
      type: "info",
      title: "Category Updated",
      message: `${data.name} category was updated.`,
      icon: data.icon || "tag",
      meta: { category_id: data.id }
    });

    emitCategoriesUpdate(userId);
    emitDashboardUpdate(userId);

    return res.json({ category: { ...data, total_transactions: 0 } });
  } catch (err) {
    console.error("Category update crash:", err);
    return res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = requireUserId(req);
    const categoryId = req.params.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: existing, error: getErr } = await supabaseAdmin
      .from("categories")
      .select("id, name, icon")
      .eq("id", categoryId)
      .eq("user_id", userId)
      .single();

    if (getErr || !existing) {
      return res.status(404).json({ error: "Category not found" });
    }

    const { error } = await supabaseAdmin
      .from("categories")
      .delete()
      .eq("id", categoryId)
      .eq("user_id", userId);

    if (error) {
      console.error("Category delete error:", error);
      return res.status(500).json({ error: "Failed to delete category" });
    }

    await createInAppNotification(userId, {
      type: "warning",
      title: "Category Deleted",
      message: `${existing.name} category was deleted.`,
      icon: existing.icon || "tag",
      meta: { category_id: existing.id }
    });

    emitCategoriesUpdate(userId);
    emitDashboardUpdate(userId);

    return res.json({ success: true });
  } catch (err) {
    console.error("Category delete crash:", err);
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

module.exports = router;
