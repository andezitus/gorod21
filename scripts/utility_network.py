"""Offline pruning of illustrative utility feeds; no browser dependencies."""
import heapq
import math
from collections import defaultdict
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, unary_union


def clean_branches(network, buildings, tolerance=.12):
    """Keep a rooted path to each valid house; remove every unused dead end."""
    branches = network['branches']
    mains = unary_union([LineString(route['p']) for route in network['routes']])
    footprints = {str(b['id']): Polygon(b['p']) for b in buildings}
    # Join numerical cracks left by rounding noded source geometry to 2 decimals.
    points = sorted({tuple(p) for branch in branches for p in branch['p']})
    parent = list(range(len(points)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    cells = defaultdict(list)
    for i, p in enumerate(points):
        cell = (math.floor(p[0]/tolerance), math.floor(p[1]/tolerance))
        for x in range(cell[0]-1, cell[0]+2):
            for y in range(cell[1]-1, cell[1]+2):
                for j in cells[x, y]:
                    if math.dist(p, points[j]) <= tolerance:
                        parent[find(i)] = find(j)
        cells[cell].append(i)
    groups = defaultdict(list)
    for i, p in enumerate(points):
        groups[find(i)].append(p)
    snapped = {}
    for group in groups.values():
        # Keep the representative on the main if this is a source junction.
        representative = min(group, key=lambda p: mains.distance(Point(p)))
        if mains.distance(Point(representative)) <= tolerance:
            representative = tuple(nearest_points(Point(representative), mains)[1].coords[0])
        for p in group:
            snapped[p] = representative
    lines = [[snapped[tuple(p)] for p in branch['p']] for branch in branches]
    connections = []
    for connection in network['houseConnections']:
        footprint = footprints.get(str(connection['building']))
        p = tuple(connection['p'])
        if footprint is None or footprint.boundary.distance(Point(p)) > .025:
            continue
        candidates = [(LineString(line).distance(Point(p)), i) for i, line in enumerate(lines) if len(set(line)) > 1]
        distance, index = min(candidates)
        if distance > tolerance:
            continue
        line = lines[index]
        # Insert the exact wall point into its nearest segment, including houses
        # whose connection is in the middle of an edge rather than at a vertex.
        segment = min(range(len(line)-1), key=lambda j: LineString(line[j:j+2]).distance(Point(p)))
        if math.dist(p, line[segment]) < .001:
            p = line[segment]
        elif math.dist(p, line[segment+1]) < .001:
            p = line[segment+1]
        else:
            line.insert(segment+1, p)
        connections.append({**connection, 'p': list(p)})
    graph = defaultdict(list)
    edges = []
    seen = set()
    for line in lines:
        for a, b in zip(line, line[1:]):
            key = tuple(sorted((a, b)))
            if a == b or key in seen:
                continue
            seen.add(key)
            index = len(edges)
            edges.append((a, b))
            length = math.dist(a, b)
            graph[a].append((b, length, index))
            graph[b].append((a, length, index))
    costs, previous, roots, queue = {}, {}, {}, []
    for node in graph:
        if mains.distance(Point(node)) < .025:
            costs[node] = 0
            roots[node] = tuple(nearest_points(Point(node), mains)[1].coords[0])
            heapq.heappush(queue, (0, node))
    while queue:
        cost, node = heapq.heappop(queue)
        if cost != costs[node]:
            continue
        for neighbor, length, index in graph[node]:
            if cost+length < costs.get(neighbor, float('inf')):
                costs[neighbor] = cost+length
                previous[neighbor] = (node, index)
                roots[neighbor] = roots[node]
                heapq.heappush(queue, (cost+length, neighbor))
    used, connected = {}, []
    for connection in connections:
        node = tuple(connection['p'])
        if node not in costs:
            continue
        root = roots[node]
        connected.append({**connection, 'root': list(root)})
        while node in previous:
            node, index = previous[node]
            used[index] = root
    # A segment is emitted once, only when a house actually uses it.
    adjacency = defaultdict(list)
    for index in used:
        for node in edges[index]:
            adjacency[node].append(index)
    terminals = {tuple(c['p']) for c in connected}
    sources = {node for node, cost in costs.items() if cost == 0}
    visited, cleaned = set(), []
    def walk(index, node):
        root, line = used[index], [list(node)]
        while index not in visited:
            visited.add(index)
            a, b = edges[index]
            node = b if node == a else a
            line.append(list(node))
            onward = [i for i in adjacency[node] if i not in visited]
            if node in terminals or node in sources or len(adjacency[node]) != 2 or not onward or used[onward[0]] != root:
                break
            index = onward[0]
        cleaned.append({'id': 'feed-'+str(len(cleaned)), 'p': line, 'root': list(root)})
    for node, incident in adjacency.items():
        if len(incident) != 2 or node in terminals or node in sources or len({used[i] for i in incident}) > 1:
            for index in incident:
                if index not in visited:
                    walk(index, node)
    for index in used:
        if index not in visited:
            walk(index, edges[index][0])
    return {**network, 'branches': cleaned, 'houseConnections': connected}
