# Low-Resource VPS Deployment Guide

## Quick Start for 256 MB RAM VPS

### 1. Minimal Configuration
```yaml
# config/settings.yml
tavily:
  enabled: true
  apiKey: ${TAVILY_API_KEY}
  searchDepth: basic
  defaultTopic: general
  timeoutMs: 30000

firecrawl:
  enabled: false  # DISABLE to save memory

http:
  concurrency: 2  # Reduced from 6
  perHost: 1      # Reduced from 2
  timeoutMs: 10000  # Reduced from 15000

cache:
  enabled: true
  maxItemsPerSource: 100  # Reduced from 300
```

### 2. Environment Setup
```bash
# Set only Tavily API key
export TAVILY_API_KEY="your-key-here"

# DO NOT set Firecrawl key to save memory
# export FIRECRAWL_API_KEY="your-key-here"
```

### 3. Add Swap (Critical)
```bash
# Create 512MB swap file
sudo fallocate -l 512M /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make swap permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify
free -h
```

### 4. Run with Memory Limits
```bash
# Limit Node.js memory to 256 MB
node --max-old-space-size=256 dist/server.js

# Or use PM2 with memory limits
pm2 start dist/server.js --max-memory-restart 256M
```

### 5. Monitor Resources
```bash
# Check memory usage
free -h

# Monitor Node.js process
ps aux | grep node

# Real-time monitoring
htop
```

---

## Memory Optimization Strategies

### Strategy 1: Disable Unused Features
```yaml
# Disable Firecrawl (saves ~30 MB)
firecrawl:
  enabled: false

# Disable research tools if not needed
# (Edit src/server.ts to comment out registerResearchTools)
```

### Strategy 2: Reduce Concurrency
```yaml
http:
  concurrency: 2  # Fewer concurrent requests
  perHost: 1      # Fewer parallel connections per host
```

### Strategy 3: Limit Cache Size
```yaml
cache:
  maxItemsPerSource: 50  # Smaller cache
  ttlMs: 900000         # Shorter TTL (15 min)
  queryTtlMs: 300000    # Shorter query cache (5 min)
```

### Strategy 4: Use Lazy Loading
```typescript
// Already implemented - clients only load when needed
const tavilyClient = new TavilyClient(settings.tavily);
const firecrawlClient = new FirecrawlClient(settings.firecrawl);
```

---

## Performance Tuning

### 1. Reduce Timeout Values
```yaml
http:
  timeoutMs: 10000  # Faster timeouts

tavily:
  timeoutMs: 20000  # Faster Tavily timeouts

firecrawl:
  timeoutMs: 30000  # Faster Firecrawl timeouts
```

### 2. Limit Request Sizes
```yaml
# In tool calls, use smaller limits
web.search:
  maxResults: 5  # Instead of 10

web.crawl:
  limit: 20  # Instead of 100
  maxDepth: 1  # Instead of 2
```

### 3. Use Efficient Formats
```yaml
# Use only markdown (lighter than HTML)
web.scrape:
  formats: ["markdown"]  # Instead of ["markdown", "html", "screenshot"]
```

---

## Monitoring & Alerts

### 1. Memory Monitoring Script
```bash
#!/bin/bash
# monitor-memory.sh

while true; do
  MEM=$(free -m | awk '/Mem:/ {print $3}')
  SWAP=$(free -m | awk '/Swap:/ {print $3}')
  echo "Memory: ${MEM}MB, Swap: ${SWAP}MB"

  if [ $MEM -gt 200 ]; then
    echo "WARNING: High memory usage!"
  fi

  sleep 60
done
```

### 2. Process Monitoring
```bash
# Monitor Node.js memory
watch -n 5 'ps aux | grep node | grep -v grep'

# Check for memory leaks
node --inspect dist/server.js
# Then use Chrome DevTools to profile
```

### 3. Log Rotation
```bash
# Prevent logs from consuming disk space
# Add to logrotate config
/home/user/.config/igs-mcp/*.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
}
```

---

## Troubleshooting

### Issue: Out of Memory (OOM)
**Symptoms**: Process killed, "Killed" message in logs

**Solutions**:
1. Add more swap (512MB - 1GB)
2. Reduce concurrency
3. Disable Firecrawl
4. Limit request sizes
5. Use `--max-old-space-size=256`

### Issue: Slow Performance
**Symptoms**: High latency, timeouts

**Solutions**:
1. Reduce timeout values
2. Limit concurrent requests
3. Use faster search depth (basic vs advanced)
4. Cache more aggressively

### Issue: High CPU Usage
**Symptoms**: CPU > 50% for extended periods

**Solutions**:
1. Reduce concurrency
2. Limit crawl depth
3. Use simpler formats (markdown only)
4. Disable unused features

---

## VPS Provider Recommendations

### 256 MB RAM VPS
- **DigitalOcean**: $4/mo (1 vCPU, 25GB SSD)
- **Linode**: $5/mo (1 vCPU, 25GB SSD)
- **Vultr**: $2.50/mo (1 vCPU, 10GB SSD)

### 512 MB RAM VPS (Recommended)
- **DigitalOcean**: $6/mo (1 vCPU, 25GB SSD)
- **Linode**: $5/mo (1 vCPU, 25GB SSD)
- **Vultr**: $4/mo (1 vCPU, 25GB SSD)

### 1 GB RAM VPS (Comfortable)
- **DigitalOcean**: $12/mo (1 vCPU, 25GB SSD)
- **Linode**: $10/mo (1 vCPU, 25GB SSD)
- **Vultr**: $6/mo (1 vCPU, 25GB SSD)

---

## Quick Reference

### Memory Requirements
| Configuration | RAM | Swap | Total |
|--------------|-----|------|-------|
| Minimal (Tavily only) | 256 MB | 256 MB | 512 MB |
| Recommended (Both) | 512 MB | 0 MB | 512 MB |
| Comfortable | 1 GB | 0 MB | 1 GB |

### Disk Requirements
| Component | Size |
|-----------|------|
| Node.js | ~50 MB |
| node_modules | ~241 MB |
| dist/ | ~268 KB |
| Config/Cache | ~10 MB |
| **Total** | **~300 MB** |

### CPU Requirements
| Operation | CPU Usage |
|-----------|-----------|
| Idle | <1% |
| Search Request | 5-15% |
| Scrape Request | 10-20% |
| Crawl Request | 20-40% |

---

## Conclusion

✅ **256 MB VPS**: Feasible with optimizations and swap
✅ **512 MB VPS**: Recommended for full functionality
✅ **1 GB VPS**: Comfortable with headroom

**Key Optimization**: Disable Firecrawl if you only need web search (Tavily). This saves ~30 MB of memory.

---

*Last updated: April 27, 2026*
